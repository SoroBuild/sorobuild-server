var StellarSdk = require("@stellar/stellar-sdk");
const axios = require("axios");
const RPC_URLS = require("./urls");
require("dotenv").config();

const { Soroban, ScInt, nativeToScVal, Address } = StellarSdk;

const accountToScVal = (account) => new Address(account).toScVal();

function stringToArray(input) {
  if (!!input) {
    return input
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "");
  }
  return [];
}

function processArgs(arg) {
  if (arg.type === "i128") {
    const quantity = Soroban.parseTokenAmount(arg.value, 7);
    return new ScInt(quantity).toI128();
  } else if (arg.type === "Address") {
    return accountToScVal(arg.value); // to
  } else if (arg.type === "u32") {
    return nativeToScVal(Number(arg.value), { type: "u32" }); // to
  } else if (arg.type === "u64") {
    return nativeToScVal(Number(arg.value)); // to
  } else if (arg.type === "u64") {
    return nativeToScVal(Number(arg.value)); // to
  } else if (arg.type === "symbol") {
    return nativeToScVal(arg.value, { type: "symbol" }); // to
  } else if (arg.type === "None" || arg.type === "option") {
    return nativeToScVal(null); // to
  } else if (arg.type === "Wasm") {
    return;
  } else if (arg.type === "BytesNString") {
    return nativeToScVal(Buffer.from(arg.value, "hex"), { type: "bytes" });
  } else if (arg.type === "vec") {
    const arrs = stringToArray(arg.value);
    const argsare = nativeToScVal(arrs, {
      type: ["u64", "u64", "symbol"],
    }); // to

    return argsare;
  } else {
    return nativeToScVal(arg.value);
  }
}

async function checkTrustline(walletAddress, assetCode, assetIssuer, network) {
  const url = `${RPC_URLS[network].HORIZON}/accounts/${walletAddress}`;

  try {
    const { data } = await axios.get(url);

    if (assetCode === "native") {
      const asset = data.balances.find((b) => b.asset_type === "native");
      return {
        isTrusted: true,
        message: "This is the native asset (XLM)",
        balance: asset?.balance ?? "0",
        limit: "NA",
      };
    }

    const asset = data.balances.find(
      (b) => b.asset_code === assetCode && b.asset_issuer === assetIssuer
    );

    if (!asset) {
      return {
        isTrusted: false,
        message:
          "Asset not trusted by destination. Trustline must be created before sending",
        balance: 0,
      };
    }

    return {
      isTrusted: true,
      message: "The asset is trusted by the destination address",
      balance: asset.balance,
      limit: asset.limit,
    };
  } catch (error) {
    // Axios provides a better structured error object
    const errorMessage = error.response?.data || error.message;
    console.error("Error checking trustline:", errorMessage);
    return { status: "error", message: errorMessage };
  }
}

module.exports = { processArgs, checkTrustline };
