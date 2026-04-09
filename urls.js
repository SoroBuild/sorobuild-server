require("dotenv").config();

const RPC_URLS = {
  PUBLIC: {
    SOROBAN: `https://rpc.ankr.com/stellar_soroban/${process.env.RPC_URL_KEY}`,

    HORIZON: `https://rpc.ankr.com/premium-http/stellar_horizon/${process.env.RPC_URL_KEY}`,
    networkPassphrase: "Public Global Stellar Network ; September 2015",
  },

  TESTNET: {
    // SOROBAN: `https://base-testnet-rpc.soro.build`,
    SOROBAN: `https://rpc-testnet.stellar.org`,
    HORIZON: "https://horizon-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  },
  FUTURENET: {
    SOROBAN: "https://rpc-futurenet.stellar.org",
    HORIZON: "https://horizon-futurenet.stellar.org",
    networkPassphrase: "Test SDF Future Network ; October 2022",
  },
};
const RPC_URLS_BACKUP = {
  PUBLIC: { SOROBAN: "", HORIZON: "" },
  TESTNER: { SOROBAN: "", HORIZON: "" },
  FUTURENET: { SOROBAN: "", HORIZON: "" },
  networkPassphrase: "Test SDF Network ; September 2015	",
};

module.exports = RPC_URLS;
