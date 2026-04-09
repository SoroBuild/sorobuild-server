const { PlatformStats } = require("../models/platformStats.model");
const { UserStats } = require("../models/userStats.model");

const VALID_NETWORKS = ["public", "testnet", "local", "futurenet"];

function validateNetwork(network) {
  if (!VALID_NETWORKS.includes(network)) {
    throw new Error(
      `Invalid network "${network}". Must be one of: ${VALID_NETWORKS.join(
        ", "
      )}`
    );
  }
}

function normalizeAddress(address) {
  if (!address) throw new Error("Wallet address is required");
  return address.trim();
}

async function ensurePlatformStats() {
  return PlatformStats.findOneAndUpdate(
    { key: "global" },
    {
      $setOnInsert: {
        key: "global",
        users: {
          public: 0,
          testnet: 0,
          local: 0,
          futurenet: 0,
          total: 0,
        },
        tx: {
          public: 0,
          testnet: 0,
          local: 0,
          futurenet: 0,
          total: 0,
        },
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
        tx: {
          public: 0,
          testnet: 0,
          local: 0,
          futurenet: 0,
          total: 0,
        },
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

  const { credit = 0, txCount = 1 } = options;

  await ensurePlatformStats();

  const existingUser = await UserStats.findOne({ address: normalizedAddress });

  let isNewUser = false;

  if (!existingUser) {
    try {
      await UserStats.create({
        address: normalizedAddress,
        credit,
        tx: {
          public: 0,
          testnet: 0,
          local: 0,
          futurenet: 0,
          total: 0,
        },
        last_active_at: new Date(),
      });
      isNewUser = true;
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  const user = await UserStats.findOneAndUpdate(
    { address: normalizedAddress },
    {
      $inc: {
        [`tx.${network}`]: txCount,
        "tx.total": txCount,
      },
      $set: {
        last_active_at: new Date(),
      },
    },
    { new: true }
  );

  if (isNewUser) {
    await incrementPlatformUsers(network, 1);
  }

  await incrementPlatformTx(network, txCount);

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
