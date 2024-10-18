// Импорт необходимых библиотек
const { Web3 } = require('web3');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const Queue = require('bull');
const winston = require('winston');
const express = require('express');
const promptSync = require('prompt-sync');
require('dotenv').config(); // Загружаем переменные окружения

const prompt = promptSync();  // Инициализация синхронного ввода

// Настройка логирования
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'rvn-eth-bridge' },
  transports: [
    new winston.transports.File({ filename: 'bridge-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'bridge-combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

// Настройка клиентов
const web3 = new Web3(process.env.ETHEREUM_NODE_URL);  // Инициализация клиента Web3

// Параметры RPC для Ravencoin
const rpcUser = process.env.RAVENCOIN_RPC_USER;
const rpcPassword = process.env.RAVENCOIN_RPC_PASSWORD;
const rpcPort = process.env.RAVENCOIN_RPC_PORT || 8766;
const rpcHost = process.env.RAVENCOIN_RPC_HOST || 'localhost';
const rpcUrl = `http://${rpcHost}:${rpcPort}/`;  // Используем HTTP для локальных запросов

// Функция отправки RPC-запроса к Ravencoin
async function sendRpcRequest(method, params = []) {
  const data = {
    jsonrpc: '1.0',
    id: 'rvn-bridge',
    method: method,
    params: params,
  };

  const config = {
    auth: {
      username: rpcUser,
      password: rpcPassword,
    },
    headers: {
      'Content-Type': 'application/json',
    },
  };

  try {
    const response = await axios.post(rpcUrl, data, config);
    return response.data.result;
  } catch (error) {
    logger.error(`Ошибка RPC-запроса: ${error.message}`);
    throw error;
  }
}

// Настройка базы данных
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB_NAME || 'bridgeDB';
let db;

async function connectToDatabase() {
  try {
    const client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    logger.info('Подключено к базе данных MongoDB');
  } catch (err) {
    logger.error('Ошибка подключения к базе данных:', err.message);
    throw err;
  }
}

connectToDatabase().then(() => {
  console.log('Подключено к базе данных MongoDB');
}).catch(err => {
  console.error('Ошибка подключения к базе данных:', err.message);
});

// Настройка очереди задач
const transactionQueue = new Queue('transactionQueue', process.env.REDIS_URL || 'redis://127.0.0.1:6379');

// Обработка задач очереди
transactionQueue.process(async (job) => {
  try {
    const tx = job.data;
    await handleIncomingRVNTransaction(tx);  // Используем await для ожидания выполнения
  } catch (error) {
    logger.error('Ошибка при обработке транзакции:', error.message);
    throw error;  // Пробрасываем ошибку, чтобы она была корректно обработана
  }
}).then(() => {
  logger.info('Задача в очереди обработана успешно');
}).catch((error) => {
  logger.error('Ошибка при обработке задачи в очереди:', error.message);
});

// Функция для получения суммы RVN от пользователя
function getRvnAmountFromUser() {
  let rvnAmount;
  do {
    rvnAmount = parseFloat(prompt("Введите количество RVN для обмена: "));
    if (isNaN(rvnAmount) || rvnAmount <= 0) {
      console.error("Некорректное значение. Введите положительное число.");
    }
  } while (isNaN(rvnAmount) || rvnAmount <= 0);

  return rvnAmount;
}

// Функции для работы с базой данных
async function getUserEthereumAddress(rvnAddress) {
  try {
    const user = await db.collection('users').findOne({ rvnAddress: rvnAddress });
    return user ? user.ethAddress : null;
  } catch (err) {
    logger.error('Ошибка при получении Ethereum-адреса:', err.message);
    throw err;
  }
}

async function isTransactionProcessed(txid) {
  try {
    const tx = await db.collection('processedTxs').findOne({ txid: txid });
    return !!tx;
  } catch (err) {
    logger.error('Ошибка при проверке транзакции:', err.message);
    throw err;
  }
}

async function markTransactionAsProcessed(txid) {
  try {
    await db.collection('processedTxs').insertOne({ txid: txid });
  } catch (err) {
    logger.error('Ошибка при отметке транзакции как обработанной:', err.message);
    throw err;
  }
}

// Фиксированный курс обмена: 1200 RVN = 100 ETH
const exchangeRate = 100 / 1200;

// Функция мониторинга входящих транзакций RVN
async function monitorRavencoinAddress() {
  const bridgeAddress = process.env.RAVENCOIN_BRIDGE_ADDRESS;

  if (!bridgeAddress) {
    logger.error('Адрес моста Ravencoin не установлен в переменных окружения.');
    return;
  }

  try {
    const transactions = await sendRpcRequest('listtransactions', ['*', 100]);
    for (const tx of transactions) {
      // Извлекаем необходимые поля из объекта транзакции
      const { address, category, txid } = tx;

      if (address === bridgeAddress && category === 'receive') {
        if (!(await isTransactionProcessed(txid))) {
          await transactionQueue.add(tx);  // Добавляем задачу в очередь
        }
      }
    }
  } catch (error) {
    logger.error('Ошибка при мониторинге адреса Ravencoin:', error.message);
  }
}

// Функция обработки входящей транзакции RVN
async function handleIncomingRVNTransaction(tx) {
  const amountRVN = tx.amount;
  const userRavencoinAddress = tx.address;

  // Запрашиваем у пользователя количество RVN для обмена
  const rvnAmountForExchange = getRvnAmountFromUser();

  // Проверка суммы на соответствие введенному значению пользователем
  if (amountRVN < rvnAmountForExchange) {
    logger.warn(`Транзакция ${tx.txid} отклонена: получено ${amountRVN} RVN, но требуется ${rvnAmountForExchange} RVN.`);
    await markTransactionAsProcessed(tx.txid);
    return;
  }

  try {
    const userEthereumAddress = await getUserEthereumAddress(userRavencoinAddress);

    if (!userEthereumAddress) {
      logger.error(`Не найден Ethereum-адрес для Ravencoin-адреса ${userRavencoinAddress}`);
      await markTransactionAsProcessed(tx.txid);
      return;
    }

    const amountETH = amountRVN * exchangeRate;
    const BigNumber = require('bignumber.js');
    const amountETHBig = new BigNumber(amountETH);

    logger.info(`Получено ${amountRVN} RVN, что эквивалентно ${amountETHBig.toFixed()} ETH.`);

    await sendETHtoUser(userEthereumAddress, amountETHBig);
    await markTransactionAsProcessed(tx.txid);
  } catch (error) {
    logger.error('Ошибка при обработке входящей транзакции RVN:', error.message);
    throw error;
  }
}

// Функция отправки ETH пользователю
async function sendETHtoUser(toAddress, amountETHBig) {
  const bridgeEthereumAddress = process.env.BRIDGE_ETHEREUM_ADDRESS;
  const bridgePrivateKey = process.env.BRIDGE_PRIVATE_KEY;

  if (!bridgeEthereumAddress || !bridgePrivateKey) {
    logger.error('Ethereum-адрес моста или приватный ключ не установлены.');
    return;
  }

  try {
    const amountWei = web3.utils.toWei(amountETHBig.toFixed(), 'ether');
    const txCount = await web3.eth.getTransactionCount(bridgeEthereumAddress, 'latest');

    const txObject = {
      nonce: web3.utils.toHex(txCount),
      to: toAddress,
      value: web3.utils.toHex(amountWei),
      gasLimit: web3.utils.toHex(21000),
      gasPrice: web3.utils.toHex(web3.utils.toWei('20', 'gwei')),
    };

    const signedTx = await web3.eth.accounts.signTransaction(txObject, bridgePrivateKey);
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    logger.info(`Отправлено ${amountETHBig.toFixed()} ETH на адрес ${toAddress}: транзакция ${receipt.transactionHash}`);
  } catch (error) {
    logger.error('Ошибка при отправке ETH пользователю:', error.message);
  }
}

// Запуск мониторинга
setInterval(monitorRavencoinAddress, 60000);

// Создание API через Express
const app = express();
app.use(express.json());

app.post('/register', async (req, res) => {
  const { rvnAddress, ethAddress } = req.body;

  if (!rvnAddress || !ethAddress) {
    return res.status(400).send('Необходимо предоставить rvnAddress и ethAddress.');
  }

  try {
    await db.collection('users').updateOne(
      { rvnAddress: rvnAddress },
      { $set: { ethAddress: ethAddress } },
      { upsert: true }
    );

    res.send('Адреса успешно зарегистрированы.');
  } catch (error) {
    logger.error('Ошибка при регистрации адресов:', error.message);
    res.status(500).send('Ошибка при регистрации адресов.');
  }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`API сервер запущен на порту ${PORT}`);
});




