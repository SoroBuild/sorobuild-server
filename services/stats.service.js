const { PlatformStats } = require("../models/platformStats.model");
const { UserStats } = require("../models/userStats.model");

const VALID_NETWORKS = ["public", "testnet", "local", "futurenet"];
const VALID_FEATURES = ["ide", "studio"];
const VALID_ACTIONS = ["deploy", "invoke", "read", "upload", "asset_ops"];

function validateNetwork(network) {
  if (!VALID_NETWORKS.includes(network)) {
    throw new Error(
      `Invalid network "${network}". Must be one of: ${VALID_NETWORKS.join(
        ", "
      )}`
    );
  }
}

function validateFeature(feature) {
  if (feature !== undefined && !VALID_FEATURES.includes(feature)) {
    throw new Error(
      `Invalid feature "${feature}". Must be one of: ${VALID_FEATURES.join(
        ", "
      )}`
    );
  }
}

function validateAction(action) {
  if (action !== undefined && !VALID_ACTIONS.includes(action)) {
    throw new Error(
      `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(", ")}`
    );
  }
}

function normalizeAddress(address) {
  if (!address) throw new Error("Wallet address is required");
  return address.trim();
}

function getDefaultNetworkStats() {
  return {
    public: 0,
    testnet: 0,
    local: 0,
    futurenet: 0,
    total: 0,
  };
}

function getDefaultFeatureStats() {
  return {
    ide: 0,
    studio: 0,
  };
}

function getDefaultActionStats() {
  return {
    deploy: 0,
    invoke: 0,
    read: 0,
    upload: 0,
    asset_ops: 0,
  };
}

async function ensurePlatformStats() {
  return PlatformStats.findOneAndUpdate(
    { key: "global" },
    {
      $setOnInsert: {
        key: "global",
        users: getDefaultNetworkStats(),
        tx: getDefaultNetworkStats(),
        feature_used: getDefaultFeatureStats(),
        action: getDefaultActionStats(),
      },
    },
    { upsert: true, new: true }
  );
}

async function getUserByWallet(address) {
  const normalizedAddress = normalizeAddress(address);
  return UserStats.findOne({ address: normalizedAddress });
}

async function createUser(address, options = {}) {
  const normalizedAddress = normalizeAddress(address);
  const { credit = 0 } = options;

  return UserStats.findOneAndUpdate(
    { address: normalizedAddress },
    {
      $setOnInsert: {
        address: normalizedAddress,
        credit,
        tx: getDefaultNetworkStats(),
        feature_used: getDefaultFeatureStats(),
        action: getDefaultActionStats(),
        last_active_at: new Date(),
      },
    },
    {
      upsert: true,
      new: true,
    }
  );
}

async function updateUser(address, update = {}) {
  const normalizedAddress = normalizeAddress(address);

  const user = await UserStats.findOneAndUpdate(
    { address: normalizedAddress },
    update,
    { new: true }
  );

  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

async function createUserIfNotExists(address, options = {}) {
  return createUser(address, options);
}

async function incrementUserTx(address, network, count = 1) {
  const normalizedAddress = normalizeAddress(address);
  validateNetwork(network);

  const user = await UserStats.findOneAndUpdate(
    { address: normalizedAddress },
    {
      $inc: {
        [`tx.${network}`]: count,
        "tx.total": count,
      },
      $set: {
        last_active_at: new Date(),
      },
    },
    { new: true }
  );

  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

async function incrementPlatformTx(network, count = 1) {
  validateNetwork(network);

  await ensurePlatformStats();

  return PlatformStats.findOneAndUpdate(
    { key: "global" },
    {
      $inc: {
        [`tx.${network}`]: count,
        "tx.total": count,
      },
    },
    { new: true }
  );
}

async function incrementPlatformUsers(network, count = 1) {
  validateNetwork(network);

  await ensurePlatformStats();

  return PlatformStats.findOneAndUpdate(
    { key: "global" },
    {
      $inc: {
        [`users.${network}`]: count,
        "users.total": count,
      },
    },
    { new: true }
  );
}

async function createOrUpdateUserByWallet(address, networkVal, options = {}) {
  const network = networkVal.toLowerCase();
  const normalizedAddress = normalizeAddress(address);
  validateNetwork(network);

  const { credit = 0, txCount = 1, feature_used, action } = options;

  validateFeature(feature_used);
  validateAction(action);

  await ensurePlatformStats();

  const existingUser = await UserStats.findOne({ address: normalizedAddress });

  let isNewUser = false;

  if (!existingUser) {
    try {
      await UserStats.create({
        address: normalizedAddress,
        credit,
        tx: getDefaultNetworkStats(),
        feature_used: getDefaultFeatureStats(),
        action: getDefaultActionStats(),
        last_active_at: new Date(),
      });
      isNewUser = true;
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  const userInc = {
    [`tx.${network}`]: txCount,
    "tx.total": txCount,
  };

  if (feature_used) {
    userInc[`feature_used.${feature_used}`] = 1;
  }

  if (action) {
    userInc[`action.${action}`] = 1;
  }

  const user = await UserStats.findOneAndUpdate(
    { address: normalizedAddress },
    {
      $inc: userInc,
      $set: {
        last_active_at: new Date(),
      },
    },
    { new: true }
  );

  if (!user) {
    throw new Error("User not found");
  }

  if (isNewUser) {
    await incrementPlatformUsers(network, 1);
  }

  const platformInc = {
    [`tx.${network}`]: txCount,
    "tx.total": txCount,
  };

  if (feature_used) {
    platformInc[`feature_used.${feature_used}`] = 1;
  }

  if (action) {
    platformInc[`action.${action}`] = 1;
  }

  await PlatformStats.findOneAndUpdate(
    { key: "global" },
    {
      $inc: platformInc,
    },
    { new: true }
  );

  return { isNewUser, user };
}

module.exports = {
  getUserByWallet,
  createUser,
  updateUser,
  createUserIfNotExists,
  incrementUserTx,
  incrementPlatformTx,
  incrementPlatformUsers,
  createOrUpdateUserByWallet,
};
