const { StellarServers } = require("@sorobuild/stellar-sdk");

require("dotenv").config();

const serverUrl = {
  rpc: {
    testnet: "https://soroban-testnet.stellar.org:443",
    public: `https://rpc.ankr.com/stellar_soroban/${process.env.RPC_URL_KEY}`,
  },
  horizon: {
    testnet: "https://horizon-testnet.stellar.org",
    public: `https://rpc.ankr.com/premium-http/stellar_horizon/${process.env.RPC_URL_KEY}`,
  },
};

const { RpcServer, HorizonServer } = new StellarServers({ serverUrl });

module.exports = { RpcServer, HorizonServer, serverUrl };
