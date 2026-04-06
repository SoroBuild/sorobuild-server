const { StellarServers } = require("@sorobuild/stellar-sdk");

require("dotenv").config();

const serverUrl = {
  rpc: {
    // testnet: `https://rpc.ankr.com/stellar_testnet_soroban/${process.env.RPC_URL_KEY}`,
    testnet: "https://soroban-testnet.stellar.org:443",
    public: `https://rpc.ankr.com/stellar_soroban/${process.env.RPC_URL_KEY}`,
  },
  horizon: {
    testnet: "https://horizon-testnet.stellar.org",
    public: `https://rpc.ankr.com/premium-http/stellar_horizon/${process.env.RPC_URL_KEY}`,
  },
};
const key = "68932c3bdf4f8d5d2bd3e9fa_9657_68932c9cd6e423ec5b9fe72a";
const { RpcServer, HorizonServer } = new StellarServers({ serverUrl });

module.exports = { RpcServer, HorizonServer, serverUrl };
