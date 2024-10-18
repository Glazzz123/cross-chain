Cross-Chain Bridge for RVN and ETH

This project is a cross-chain bridge that enables the exchange of Ravencoin (RVN) to Ethereum (ETH). It provides a mechanism for users to transfer RVN tokens to an Ethereum address in exchange for ETH at a predetermined exchange rate.

Features

Automated Transaction Handling: The bridge monitors incoming RVN transactions and processes them automatically to exchange for ETH.

Queue Management: A task queue is used to handle transactions in an orderly manner to ensure reliability and scalability.

REST API: Users can register their RVN and ETH addresses using a RESTful API.

Secure Transaction Processing: Transactions are processed with proper error handling to ensure that data integrity is maintained.

Prerequisites

Node.js: Version 14 or higher.

MongoDB: Used as a database for tracking user information and processed transactions.

Redis: Used to manage the task queue with Bull.

Ethereum Node: You will need access to an Ethereum node (e.g., via Infura) to interact with the Ethereum network.

Ravencoin Node: RPC access to a Ravencoin node for monitoring incoming transactions.

Installation

Clone the repository:

git clone https://github.com/Glazzz123/cross-chain.git
cd cross-chain

Install the required dependencies:

npm install

Create a .env file in the root directory with the following variables:

MONGODB_URI=mongodb://localhost:27017
REDIS_URL=redis://127.0.0.1:6379
ETHEREUM_NODE_URL=your_ethereum_node_url
RAVENCOIN_RPC_USER=your_rpc_user
RAVENCOIN_RPC_PASSWORD=your_rpc_password
RAVENCOIN_RPC_HOST=localhost
RAVENCOIN_RPC_PORT=8766
RAVENCOIN_BRIDGE_ADDRESS=your_ravencoin_bridge_address
BRIDGE_ETHEREUM_ADDRESS=your_ethereum_bridge_address
BRIDGE_PRIVATE_KEY=your_bridge_private_key
PORT=3000

Usage

Start MongoDB and Redis: Ensure that both MongoDB and Redis are running locally or are accessible from your environment.

Run the Bridge: Start the cross-chain bridge by running:

node bridge.js

API Registration: Use the /register endpoint to register an RVN address with a corresponding ETH address.

curl -X POST http://localhost:3000/register -H "Content-Type: application/json" -d '{"rvnAddress": "your_rvn_address", "ethAddress": "your_eth_address"}'

How It Works

Monitoring RVN Transactions: The bridge monitors a specific RVN address for incoming transactions.

Processing Transactions: When RVN tokens are received, the bridge calculates the equivalent ETH amount at a fixed exchange rate and sends it to the user's registered ETH address.

Logging: Winston is used for logging, and logs are stored both locally and in the console for error tracking and debugging.

Security Considerations

Private Key Management: Ensure that the private key used for signing Ethereum transactions is securely managed. Do not expose it publicly or hard-code it directly in the script.

Environment Variables: Sensitive data is managed using environment variables. Ensure your .env file is not included in version control.

Troubleshooting

Database Connection Error: Ensure MongoDB is running and accessible at the URI specified in your .env file.

Ethereum/Ravencoin Node Issues: Verify that both the Ethereum and Ravencoin nodes are running and accessible.

License

This project is licensed under the MIT License. See the LICENSE file for details.

Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Contact

For questions or support, feel free to open an issue on the repository or reach out via the contact information provided on the GitHub profile.
