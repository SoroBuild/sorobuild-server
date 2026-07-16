const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");
const keys = require("./config/keys");
const Credit = require("./models/invoke-credit-model");
const cors = require("cors"); // Import CORS
var StellarSdk = require("@stellar/stellar-sdk");
const multer = require("multer");
const upload = multer(); // Create a multer instance for handling form-data'
const { processArgs, checkTrustline } = require("./utils");
const RPC_URLS = require("./urls");
const { RpcServer, serverUrl } = require("./config/sorobuild-config");
const { createOrUpdateUserByWallet } = require("./services/stats.service");
const statsRoutes = require("./routes/stats.routes");

const BASE_FEE = "1000000";

const {
  nativeToScVal,
  Address,
  scValToNative,
  Keypair,
  Operation,
  Horizon,
  Asset,
  Networks,
} = StellarSdk;

require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

mongoose
  .connect(keys.MONGODB_URI)
  .then(() => {
    console.log("connected to mongo db");
  })
  .catch((err) => {
    console.error("Error connecting to mongo db:", err);
  });

const findUserCredit = async (address) => {
  try {
    const totalRecords = await Credit.countDocuments({});
    let defaultCredit;

    if (totalRecords < 20) {
      defaultCredit = { address: address, credit: 20 }; // 20 credit if records < 20
    } else if (totalRecords >= 20 && totalRecords < 50) {
      defaultCredit = { address: address, credit: 10 }; // 5 credit if records between 20 and 99
    } else {
      defaultCredit = { address: address, credit: 0 }; // 0 credit if records >= 100
    }

    const creditRecord = await Credit.findOneAndUpdate(
      { address },
      { $setOnInsert: defaultCredit },
      { new: true, upsert: true }
    );

    return creditRecord;
  } catch (error) {
    console.error("Error in findOrCreateCredit:", error);
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
};

const updateCredit = async (address, creditChange) => {
  try {
    // Find the document by address and increment the credit by creditChange
    const updatedRecord = await Credit.findOneAndUpdate(
      { address }, // Query to find the document by address
      { $inc: { credit: creditChange } }, // Increment the credit field by the creditChange value
      { new: true } // Return the updated document
    );

    if (updatedRecord) {
      console.log("Updated Record:", updatedRecord);
    } else {
      console.log("No record found with the given address.");
    }

    return updatedRecord;
  } catch (error) {
    console.error("Error updating credit:", error);
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
};

const bufferStorage = {};

function stringifyBigInts(obj) {
  if (typeof obj === "bigint") {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(stringifyBigInts);
  }

  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, stringifyBigInts(value)])
    );
  }

  return obj;
}

function safeStringify(obj) {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

async function contractGet(pubKey, contractId, operation, args, fee, network) {
  const server = RpcServer(network, "json");

  const source = await server.getAccount(pubKey);

  const contract = new StellarSdk.Contract(contractId);

  const tx = new StellarSdk.TransactionBuilder(source, {
    fee,
    networkPassphrase: RPC_URLS[network].networkPassphrase,
  })
    .setTimeout(StellarSdk.TimeoutInfinite)
    .addOperation(contract.call(operation, ...args))
    .build()
    .toXDR();

  const res = await server.simulateTransaction(tx);
  return res;
}

// Define the allowed origins
const allowedOrigins = [
  "https://sorobuild.io",
  "https://soro.build",
  "https://www.soro.build",
  "https://studio.soro.build",
  "https://ide.soro.build",
  "https://www.sorobuild.io",
  "https://socket.fi",
  "http://localhost:5173",
  "http://localhost:8080",
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// app.use(cors());
// Parse JSON request bodies
app.use(express.json());

function parseSpec(spec) {
  return spec.funcs().map((fn) => ({
    name: fn.name().toString(),
    doc: fn.doc().toString(),
    inputs: fn.inputs().map((input) => ({
      name: input.name().toString(),
      type: input.type().switch().name,
    })),
    outputs: fn.outputs().map((output) => ({
      name: output.switch().name,
      type: output.switch().name,
    })),
  }));
}

app.post("/getUserCredit", async (req, res) => {
  const { accountId } = req.body;

  if (!accountId) {
    return res.status(400).json({ error: "Account ID is required" });
  }

  try {
    const userCredit = await findUserCredit(accountId);

    res.status(200).json({
      message: "credit fetched",
      data: userCredit,
    });
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

// Fetch a minimal set of current info about a Stellar account. Needed to get the current sequence number for the account so you can build a successful transaction with TransactionBuilder.
app.post("/getAccount", async (req, res) => {
  const { accountId, network } = req.body;

  if (!accountId) {
    return res.status(400).json({ error: "Account ID is required" });
  }

  try {
    const server = new StellarSdk.rpc.Server(RPC_URLS[network].SOROBAN);
    const account = await server.getAccount(accountId);

    res.status(200).json({
      message: "account fetched",
      data: account,
    });
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.post("/loadContractSpecs", async (req, res) => {
  const { network, contractId } = req.body;
  console.log("the body are", req.body);

  if (!contractId || !network) {
    return res
      .status(400)
      .json({ error: "Contract ID and network phrase are  required" });
  }

  try {
    const server = new StellarSdk.rpc.Server(RPC_URLS[network].SOROBAN);
    const contractBinary = await server.getContractWasmByContractId(contractId);
    const options = {
      contractId: contractId,
      networkPassphrase: RPC_URLS[network].networkPassphrase,
      rpcUrl: RPC_URLS[network].SOROBAN,
    };

    const spec = (
      await StellarSdk.contract.Client.fromWasm(contractBinary, options)
    )?.spec;

    const contractSpec = await parseSpec(spec);

    res.status(200).json({
      message: "contract specs loaded successful",
      data: contractSpec,
    });
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );

    return res.status(400).json({
      error: `${
        error.response ? error.response.data : error.message
      } (Selected Network: ${network})`,
    });
  }
});

app.post("/simulateTransaction", async (req, res) => {
  const { pubKey, fee, network, contractId, operation, args } = req.body;

  if (!pubKey || !fee || !network || !contractId || !operation) {
    return res.status(400).json({ error: "request body is incomplete" });
  }

  try {
    const invokeArgs = [operation];
    for (const eachArg of args) {
      if (eachArg?.type === "Wasm") {
        const wasmUpload = bufferStorage[pubKey];

        if (!wasmUpload) {
          return res
            .status(400)
            .json({ error: "Wasm file not found in bufferStorage" });
        }

        invokeArgs.push(nativeToScVal(wasmUpload));
        // Don't delete bufferStorage[pubKey] yet; do it only after successful simulation
      } else {
        invokeArgs.push(processArgs(eachArg));
      }
    }

    const server = new StellarSdk.rpc.Server(RPC_URLS[network].SOROBAN);
    const source = await server.getAccount(pubKey);

    const contract = new StellarSdk.Contract(contractId);

    const txBuilderSim = new StellarSdk.TransactionBuilder(source, {
      fee,
      networkPassphrase: RPC_URLS[network].networkPassphrase,
    })
      .setTimeout(60) // Explicit timeout
      .addOperation(contract.call(...invokeArgs))
      .build();

    const response = await server.simulateTransaction(txBuilderSim);

    if (
      StellarSdk.rpc.Api.isSimulationSuccess(response) &&
      response.result?.retval !== undefined
    ) {
      let result = scValToNative(response.result.retval);

      if (typeof result === "object") {
        result = JSON.stringify(result, (key, value) =>
          typeof value === "bigint" ? value.toString() : value
        );
      }

      res.status(200).json({
        message: "Transaction simulated",
        data: typeof result === "bigint" ? result.toString() : result,
      });

      delete bufferStorage[pubKey];
    } else {
      res.status(400).json({
        error: "Simulation failed",
        details: response,
      });
    }
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message,
    });
  }
});

app.post("/prepareTransaction", async (req, res) => {
  const { tx, network } = req.body;

  if (!tx || !network) {
    return res.status(400).json({ error: "transaction xdr is required" });
  }

  try {
    const server = new StellarSdk.rpc.Server(RPC_URLS[network].SOROBAN);
    const preparedTransaction = await server.prepareTransaction(tx);

    res.status(200).json({
      message: "transaction prepared",
      data: preparedTransaction.toXDR(),
    });
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.post("/sendTransactionMemory", async (req, res) => {
  const { userKey, signedTx, network } = req.body;

  if (!userKey || !signedTx || !network) {
    return res.status(400).json({ error: "signed transaction is required" });
  }

  try {
    const server = new StellarSdk.rpc.Server(RPC_URLS[network].SOROBAN);
    const tx = StellarSdk.TransactionBuilder.fromXDR(
      signedTx,
      RPC_URLS[network].networkPassphrase
    );

    const sendResponse = await server.sendTransaction(tx);

    if (sendResponse.status === "PENDING") {
      let txResponse = await server.getTransaction(sendResponse.hash);

      while (
        txResponse.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND
      ) {
        txResponse = await server.getTransaction(sendResponse.hash);

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (
        txResponse.status === StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS
      ) {
        const sendRes = await server.getTransaction(sendResponse.hash);

        bufferStorage[userKey] = sendRes.returnValue._value;

        res.status(200).json({
          message: "transaction submited",
          data: sendRes,
        });
      }
    }
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.post("/send-transaction", async (req, res) => {
  const {
    signedTx,
    network,
    pubKey = null,
    feature_used = "studio",
    action = null,
    type = null,
  } = req.body;

  if (!signedTx || !network) {
    return res.status(400).json({ error: "signed transaction is required" });
  }

  try {
    let sendResponse;

    if (type === "classic") {
      const server = new Horizon.Server(
        serverUrl.horizon[network?.toLowerCase()]
      );

      const tx = StellarSdk.TransactionBuilder.fromXDR(
        signedTx,
        Networks[network]
      );

      sendResponse = await server.submitTransaction(tx);
    } else {
      const server = RpcServer(network, "json");
      sendResponse = await server.sendTransaction(signedTx);
    }

    if (sendResponse) {
      if (pubKey) {
        await createOrUpdateUserByWallet(pubKey, network, {
          feature_used,
          action,
        });
        console.log("stats updated");
      }
      res.status(200).json({
        message: "transaction submited",
        data: sendResponse,
      });
    }
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.post("/txBuilder", async (req, res) => {
  const { source, fee, network } = req.body;

  if (!source || !fee || !network) {
    return res.status(400).json({ error: "request body is incomplete" });
  }

  try {
    const txBuilder = new StellarSdk.TransactionBuilder(source, {
      fee,
      networkPassphrase: RPC_URLS[network].networkPassphrase,
    });

    res.status(200).json({
      message: "transaction builder",
      data: txBuilder,
    });
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.post("/load-contract", upload.single("wasm"), async (req, res) => {
  const { pubKey, fee, network } = req.body;

  // const userCredit = await findUserCredit(pubKey);

  // if (userCredit.credit === 0) {
  //   return res
  //     .status(400)
  //     .json({ error: "not enough credit for this request" });

  // }

  const wasm = req.file.buffer;

  if (!wasm || !pubKey || !fee || !network) {
    return res.status(400).json({ error: "request body is incomplete" });
  }

  try {
    const server = RpcServer(network, "parsed");

    const source = await server.getAccount(pubKey);

    const txBuilder = new StellarSdk.TransactionBuilder(source, {
      fee,
      networkPassphrase: RPC_URLS[network].networkPassphrase,
    })
      .setTimeout(StellarSdk.TimeoutInfinite)
      .addOperation(StellarSdk.Operation.uploadContractWasm({ wasm: wasm }))
      .build()
      .toXDR();

    const preparedTransactionXdr = await server.prepareTransaction(txBuilder);

    // bufferStorage[pubKey] = StellarSdk.hash(wasm);

    res.status(200).json({
      xdr: preparedTransactionXdr,
    });
    // await updateCredit(pubKey, -1);
  } catch (error) {
    console.error("Error found:", error);
    return res
      .status(401)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.post("/create-contract", async (req, res) => {
  const { wasm, pubKey, network, constructorArgsXdr = [] } = req.body;

  const constructorArgs = constructorArgsXdr.map((xdr64) =>
    StellarSdk.xdr.ScVal.fromXDR(xdr64, "base64")
  );
  // const userCredit = await findUserCredit(pubKey);

  // if (userCredit.credit === 0) {
  //   return res
  //     .status(400)
  //     .json({ error: "not enough credit for this request" });
  // }

  const senderAddr = new StellarSdk.Address(pubKey);

  if (!wasm || !pubKey || !network) {
    return res.status(400).json({ error: "request body is incomplete" });
  }

  try {
    const server = RpcServer(network);
    const source = await server.getAccount(pubKey);

    const txBuilder = new StellarSdk.TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: RPC_URLS[network].networkPassphrase,
    })
      .setTimeout(StellarSdk.TimeoutInfinite)
      .addOperation(
        StellarSdk.Operation.createCustomContract({
          address: senderAddr,
          wasmHash: Buffer.from(wasm, "hex"),
          constructorArgs: constructorArgs,
        })
      )
      .build()
      .toXDR();

    const preparedTransaction = await server.prepareTransaction(txBuilder);

    res.status(200).json({
      message: "prepare load wasm successful",
      data: preparedTransaction,
    });
    await updateCredit(pubKey, -1);
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.post("/buyCredit", async (req, res) => {
  const { pubKey, fee, network, selectedOption, memo } = req.body;

  if (!pubKey || !fee || !network || !selectedOption) {
    return res.status(400).json({ error: "request body is incomplete" });
  }

  const invokeArgs = ["buy_invoke_credit"];
  invokeArgs.push(new Address(pubKey).toScVal());
  invokeArgs.push(nativeToScVal(Number(selectedOption), { type: "u32" }));

  try {
    const server = new StellarSdk.rpc.Server(RPC_URLS[network].SOROBAN);
    const source = await server.getAccount(pubKey);

    const buyContract = process.env.BUY_CONTRACT;

    const contract = new StellarSdk.Contract(buyContract);

    const txBuilderAny = new StellarSdk.TransactionBuilder(source, {
      fee,
      networkPassphrase: RPC_URLS[network].networkPassphrase,
    })
      .setTimeout(StellarSdk.TimeoutInfinite)
      .addOperation(contract.call(...invokeArgs));

    if (memo?.length > 0) {
      txBuilderAny.addMemo(StellarSdk.Memo.text(memo));
    }

    const txBuilder = txBuilderAny.build();

    const preparedTransaction = await server.prepareTransaction(txBuilder);

    res.status(200).json({
      message: "prepare invoke successful",
      data: preparedTransaction.toXDR(),
    });
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.post("/sendBuy", async (req, res) => {
  const { pubKey, signedTx, network } = req.body;

  if (!signedTx || !network) {
    return res.status(400).json({ error: "signed transaction is required" });
  }

  try {
    const server = new StellarSdk.rpc.Server(RPC_URLS[network].SOROBAN);
    const tx = StellarSdk.TransactionBuilder.fromXDR(
      signedTx,
      RPC_URLS[network].networkPassphrase
    );
    const sendResponse = await server.sendTransaction(tx);

    if (sendResponse.status === "PENDING") {
      let txResponse = await server.getTransaction(sendResponse.hash);

      while (
        txResponse.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND
      ) {
        txResponse = await server.getTransaction(sendResponse.hash);

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (
        txResponse.status === StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS
      ) {
        const sendRes = await server.getTransaction(sendResponse.hash);

        await updateCredit(
          pubKey,
          Number(sendRes.returnValue._value[0]._attributes.val._value)
        );

        res.status(200).json({
          message: "transaction submited",
          data: sendRes,
        });
      }
    }
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.post("/any-invoke", async (req, res) => {
  const {
    pubKey,
    network,
    contractId,
    operation,
    argsXdr = [],
    feature_used = "studio",
  } = req.body;

  const args = argsXdr.map((xdr64) =>
    StellarSdk.xdr.ScVal.fromXDR(xdr64, "base64")
  );

  // const userCredit = await findUserCredit(pubKey);

  // if (userCredit.credit === 0) {
  //   return res
  //     .status(400)
  //     .json({ error: "not enough credit for this request" });
  // }

  if (!pubKey || !network || !contractId || !operation) {
    return res.status(400).json({ error: "request body is incomplete" });
  }

  try {
    try {
      console.log(
        "what is is",
        pubKey,
        contractId,
        operation,
        args,
        BASE_FEE,
        network
      );
      const callCheckRes = await contractGet(
        pubKey,
        contractId,
        operation,
        args,
        BASE_FEE,
        network
      );

      if (!callCheckRes?.stateChanges && callCheckRes) {
        console.log("the call res", callCheckRes);
        const output = safeStringify(callCheckRes?.results[0]?.returnValueJson);

        if (pubKey) {
          await createOrUpdateUserByWallet(pubKey, network, {
            feature_used,
            action: "read",
          });
        }
        return res.status(200).json({ output: output, noStateChange: true });

        // if (output !== "void") {
        //   return res.status(200).json({ output: output, noStateChange: true });
        // }
      }
    } catch (error) {
      console.log(error);
      return res
        .status(400)
        .json({ error: error.response ? error.response.data : error.message });
    }

    const server = RpcServer(network, "json");

    const source = await server.getAccount(pubKey);

    const contract = new StellarSdk.Contract(contractId);

    const txBuilderAny = new StellarSdk.TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: RPC_URLS[network].networkPassphrase,
    })
      .setTimeout(StellarSdk.TimeoutInfinite)
      .addOperation(contract.call(operation, ...args));

    const txBuilder = txBuilderAny.build().toXDR();

    const preparedTransaction = await server.prepareTransaction(txBuilder);

    res.status(200).json({
      message: "prepare invoke successful",
      data: preparedTransaction,
    });
    await updateCredit(pubKey, -1);
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.post("/any-transaction-builder", async (req, res) => {
  const { pubKey, network, contractId, operationsXdr, argsXdr = [] } = req.body;

  const args = argsXdr.map((xdr64) =>
    StellarSdk.xdr.ScVal.fromXDR(xdr64, "base64")
  );

  const operations = operationsXdr.map((xdr64) =>
    StellarSdk.xdr.Operation.fromXDR(xdr64, "base64")
  );

  // const userCredit = await findUserCredit(pubKey);

  // if (userCredit.credit === 0) {
  //   return res
  //     .status(400)
  //     .json({ error: "not enough credit for this request" });
  // }

  if (!pubKey || !network || !operations) {
    return res.status(400).json({ error: "request body is incomplete" });
  }

  try {
    const server = new Horizon.Server(
      serverUrl.horizon[network?.toLowerCase()]
    );

    const source = await server.loadAccount(pubKey);

    let transaction = new StellarSdk.TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: Networks[network],
    }).setTimeout(30);

    for (let op of operations) {
      transaction.addOperation(op);
    }

    const txXdr = transaction.build().toXDR();

    res.status(200).json({
      message: "any transaction builder successful",
      data: txXdr,
    });
    await updateCredit(pubKey, -1);
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.post("/change-trust", async (req, res) => {
  const { pubKey, network, assetCode, issuerAddress, limit } = req.body;

  if (!pubKey || !network || !assetCode || !issuerAddress) {
    return res.status(400).json({ error: "request body is incomplete" });
  }

  try {
    const setAsset = new Asset((code = assetCode), (issuer = issuerAddress));
    const server = new StellarSdk.Horizon.Server(RPC_URLS[network].HORIZON);
    const serverSubmit = new StellarSdk.rpc.Server(RPC_URLS[network].SOROBAN);
    const source = await server.loadAccount(pubKey);
    let changeTrustObj = { asset: setAsset, source: pubKey };
    if (limit) {
      changeTrustObj.limit = limit;
    }

    const txBuilderAny = new StellarSdk.TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: RPC_URLS[network].networkPassphrase,
    })
      .setTimeout(StellarSdk.TimeoutInfinite)
      .addOperation(Operation.changeTrust(changeTrustObj));

    if (memo?.length > 0) {
      txBuilderAny.addMemo(StellarSdk.Memo.text(memo));
    }

    const tx = txBuilderAny.build();

    res.status(200).json({
      message: "sign change trust",
      data: tx?.toXDR(),
    });
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.post("/payment", async (req, res) => {
  const {
    pubKey,
    fee,
    network,
    assetCode,
    issuerAddress,
    destinationAddresss,
    amount,
  } = req.body;

  if (!pubKey || !network || !assetCode || !amount || !destinationAddresss) {
    return res.status(400).json({ error: "request body is incomplete" });
  }

  try {
    const destinationTrustData = await checkTrustline(
      destinationAddresss,
      assetCode,
      issuerAddress,
      network
    );

    const senderTrustData = await checkTrustline(
      pubKey,
      assetCode,
      issuerAddress,
      network
    );

    const available = parseFloat(senderTrustData?.balance ?? "0");
    const requested = parseFloat(amount ?? "0");

    if (isNaN(requested)) {
      return res.status(400).json({ error: "Invalid amount." });
    }

    if (issuerAddress !== pubKey && requested > available) {
      return res.status(400).json({
        error: `Insufficient Balance: Your ${assetCode} balance is ${available}, but you're trying to send ${requested}.`,
        status: senderTrustData?.isTrusted,
      });
    }

    if (
      !destinationTrustData?.isTrusted &&
      issuerAddress !== destinationAddresss
    ) {
      return res.status(400).json({
        error: destinationTrustData?.message,
        status: destinationTrustData?.isTrusted,
      });
    }

    if (destinationTrustData?.isTrusted && assetCode !== "native") {
      const balance = parseFloat(destinationTrustData.balance ?? "0");
      const limit = parseFloat(destinationTrustData.limit ?? "0");
      const sendAmount = parseFloat(amount ?? "0");

      if (balance + sendAmount > limit) {
        return res.status(400).json({
          error: `Insufficient trustline limit: Current balance is ${balance}, limit is ${limit}, and you're trying to send ${sendAmount}. you can only send a max of ${
            limit - balance
          }`,
          status: true,
        });
      }
    }

    let setAsset;

    if (assetCode === "native") {
      setAsset = Asset.native;
    } else {
      setAsset = new Asset((code = assetCode), (issuer = issuerAddress));
    }

    const server = new StellarSdk.Horizon.Server(RPC_URLS[network].HORIZON);
    const source = await server.loadAccount(pubKey);
    const paymentObj = {
      destination: destinationAddresss,
      asset: setAsset,
      amount: amount,
    };

    const txBuilderAny = new StellarSdk.TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: RPC_URLS[network].networkPassphrase,
    })
      .setTimeout(StellarSdk.TimeoutInfinite)
      .addOperation(Operation.payment(paymentObj));

    if (memo?.length > 0) {
      txBuilderAny.addMemo(StellarSdk.Memo.text(memo));
    }

    const tx = txBuilderAny.build();

    res.status(200).json({
      message: "Payment transaction created",
      data: tx?.toXDR(),
    });
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});
// Route to make the Stellar Testnet Soroban RPC request
app.post("/getTransaction", async (req, res) => {
  const { hash, network } = req.body; // Expecting the transaction hash in the request body

  if (!hash || !network) {
    return res.status(400).json({ error: "Transaction hash is required" });
  }

  try {
    const response = await axios.post(
      RPC_URLS[network].SOROBAN,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: {
          hash: hash,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json({
      message: "Transaction fetched successfully",
      data: response.data,
    });
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.post("/check-is-winner", async (req, res) => {
  const { pubKey, network, contractId, operation, args } = req.body;

  if (args.length === 0 && !operation) {
    return res.status(400).json({ error: "incomplete request parameters" });
  }

  const invokeArgs = [operation];
  for (const eachArg of args) {
    if (eachArg?.type === "Wasm") {
      const wasmUpload = bufferStorage[pubKey];

      invokeArgs.push(nativeToScVal(wasmUpload));
      delete bufferStorage[pubKey];
    } else {
      invokeArgs.push(processArgs(eachArg));
    }
  }

  // if (!tx) {
  //   return res.status(400).json({ error: "transaction xdr is required" });
  // }

  try {
    const server = new StellarSdk.rpc.Server(RPC_URLS[network].SOROBAN);
    const source = await server.getAccount(pubKey);

    const contract = new StellarSdk.Contract(contractId);

    const txBuilderSim = new StellarSdk.TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: RPC_URLS[network].networkPassphrase,
    })
      .setTimeout(StellarSdk.TimeoutInfinite)
      .addOperation(contract.call(...invokeArgs))
      .build();

    const simRes = await server.simulateTransaction(txBuilderSim);

    // const result = scValToNative(simRes.result.retval._value[0]._attributes.key);
    // const result = scValToNative(
    //   simRes.result.retval._value[0]._attributes.key
    // );

    const result = simRes.result.retval._value;

    res.status(200).json({
      message: "transaction simulated",
      // data: StellarSdk.scValToNative(simRes.result.retval),
      data: result,
    });
  } catch (error) {
    console.log;
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.post("/check-selection-open", async (req, res) => {
  const { pubKey, network, contractId, operation, args } = req.body;

  if (args.length === 0 && !operation) {
    return res.status(400).json({ error: "incomplete request parameters" });
  }

  const invokeArgs = [operation];
  for (const eachArg of args) {
    if (eachArg?.type === "Wasm") {
      const wasmUpload = bufferStorage[pubKey];

      invokeArgs.push(nativeToScVal(wasmUpload));
      delete bufferStorage[pubKey];
    } else {
      invokeArgs.push(processArgs(eachArg));
    }
  }

  // if (!tx) {
  //   return res.status(400).json({ error: "transaction xdr is required" });
  // }

  try {
    const server = new StellarSdk.rpc.Server(RPC_URLS[network].SOROBAN);
    const source = await server.getAccount(pubKey);

    const contract = new StellarSdk.Contract(contractId);

    const txBuilderSim = new StellarSdk.TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: RPC_URLS[network].networkPassphrase,
    })
      .setTimeout(StellarSdk.TimeoutInfinite)
      .addOperation(contract.call(...invokeArgs))
      .build();

    const simRes = await server.simulateTransaction(txBuilderSim);

    // const result = scValToNative(simRes.result.retval._value[0]._attributes.key);
    // const result = scValToNative(
    //   simRes.result.retval._value[0]._attributes.key
    // );

    const result = simRes.result.retval._value;

    res.status(200).json({
      message: "transaction simulated",
      // data: StellarSdk.scValToNative(simRes.result.retval),
      data: result,
    });
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.post("/invoke-quest", async (req, res) => {
  const { operation, args, network } = req.body;

  const signer = Keypair.fromSecret(process.env.SIGNER);
  const pubKey = signer.publicKey();

  const contractId = "CD56K3BOQRG7FRKQ4LLJX72V2UMLDGQKTIEJJYP4EBHTJO4UUPWFNJCU";
  const memo = "";

  if (!operation || args.length === 0 || !network) {
    return res.status(400).json({ error: "request body is incomplete" });
  }

  const invokeArgs = [operation];
  for (const eachArg of args) {
    if (eachArg?.type === "Wasm") {
      const wasmUpload = bufferStorage[pubKey];

      invokeArgs.push(nativeToScVal(wasmUpload));
      delete bufferStorage[pubKey];
    } else {
      invokeArgs.push(processArgs(eachArg));
    }
  }

  try {
    const server = new StellarSdk.rpc.Server(RPC_URLS[network].SOROBAN);
    const source = await server.getAccount(pubKey);

    const contract = new StellarSdk.Contract(contractId);

    const txBuilderAny = new StellarSdk.TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: RPC_URLS[network].networkPassphrase,
    })
      .setTimeout(StellarSdk.TimeoutInfinite)
      .addOperation(contract.call(...invokeArgs));

    if (memo?.length > 0) {
      txBuilderAny.addMemo(StellarSdk.Memo.text(memo));
    }

    const txBuilder = txBuilderAny.build();

    const tx = await server.prepareTransaction(txBuilder);

    tx.sign(signer);

    const sendResponse = await server.sendTransaction(tx);

    if (sendResponse.status === "PENDING") {
      let txResponse = await server.getTransaction(sendResponse.hash);

      while (
        txResponse.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND
      ) {
        txResponse = await server.getTransaction(sendResponse.hash);

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (
        txResponse.status === StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS
      ) {
        const sendRes = await server.getTransaction(sendResponse.hash);

        res.status(200).json({
          message: "transaction submited",
          data: sendRes,
        });
      }
    }
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return res
      .status(400)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.use("/api/stats", statsRoutes);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
