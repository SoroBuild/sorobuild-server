const { PlatformStats } = require("../models/platformStats.model");
const { UserStats } = require("../models/userStats.model");

const NETWORKS = ["public", "testnet", "local", "futurenet"];

function safeNumber(value) {
  return typeof value === "number" && !Number.isNaN(value) ? value : 0;
}

function withNetworkTotals(source = {}) {
  const result = {
    public: safeNumber(source.public),
    testnet: safeNumber(source.testnet),
    local: safeNumber(source.local),
    futurenet: safeNumber(source.futurenet),
    total: safeNumber(source.total),
  };

  if (!result.total) {
    result.total =
      result.public + result.testnet + result.local + result.futurenet;
  }

  return result;
}

function withFeatureTotals(source = {}) {
  return {
    studio: safeNumber(source.studio),
    ide: safeNumber(source.ide),
    total: safeNumber(source.studio) + safeNumber(source.ide),
  };
}

function withActionTotals(source = {}) {
  const result = {
    deploy: safeNumber(source.deploy),
    invoke: safeNumber(source.invoke),
    read: safeNumber(source.read),
    upload: safeNumber(source.upload),
    asset_ops: safeNumber(source.asset_ops),
    upgrade: safeNumber(source.upgrade),
  };

  result.total =
    result.deploy +
    result.invoke +
    result.read +
    result.upload +
    result.asset_ops +
    result.upgrade;

  return result;
}

function getTopNetwork(data = {}) {
  const entries = NETWORKS.map((key) => [key, safeNumber(data[key])]);
  entries.sort((a, b) => b[1] - a[1]);

  return {
    name: entries[0]?.[0] || "public",
    value: entries[0]?.[1] || 0,
  };
}

function getPercent(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

async function getPlatformStats(req, res) {
  try {
    const [platformStats, totalUsersFromDb, activeUsers7d, activeUsers30d] =
      await Promise.all([
        PlatformStats.findOne({ key: "global" }).lean(),
        UserStats.countDocuments(),
        UserStats.countDocuments({
          last_active_at: {
            $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        }),
        UserStats.countDocuments({
          last_active_at: {
            $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        }),
      ]);

    if (!platformStats) {
      return res.status(200).json({
        success: true,
        data: {
          users: {
            public: 0,
            testnet: 0,
            local: 0,
            futurenet: 0,
            total: totalUsersFromDb || 0,
          },
          tx: {
            public: 0,
            testnet: 0,
            local: 0,
            futurenet: 0,
            total: 0,
          },
          feature_used: {
            studio: 0,
            ide: 0,
            total: 0,
          },
          action: {
            deploy: 0,
            invoke: 0,
            read: 0,
            upload: 0,
            asset_ops: 0,
            upgrade: 0,
            total: 0,
          },
          overview: {
            total_users: totalUsersFromDb || 0,
            total_transactions: 0,
            active_users_7d: activeUsers7d || 0,
            active_users_30d: activeUsers30d || 0,
            top_user_network: {
              name: "public",
              value: 0,
            },
            top_tx_network: {
              name: "public",
              value: 0,
            },
            last_updated_at: null,
          },
          percentages: {
            users: {
              public: 0,
              testnet: 0,
              local: 0,
              futurenet: 0,
            },
            tx: {
              public: 0,
              testnet: 0,
              local: 0,
              futurenet: 0,
            },
            feature_used: {
              studio: 0,
              ide: 0,
            },
          },
        },
      });
    }

    const users = withNetworkTotals(platformStats.users);
    const tx = withNetworkTotals(platformStats.tx);
    const feature_used = withFeatureTotals(platformStats.feature_used);
    const action = withActionTotals(platformStats.action);

    const normalizedUsers = {
      ...users,
      total: Math.max(users.total, totalUsersFromDb || 0),
    };

    const topUserNetwork = getTopNetwork(normalizedUsers);
    const topTxNetwork = getTopNetwork(tx);

    return res.status(200).json({
      success: true,
      data: {
        users: normalizedUsers,
        tx,
        feature_used,
        action,
        overview: {
          total_users: normalizedUsers.total,
          total_transactions: tx.total,
          active_users_7d: activeUsers7d || 0,
          active_users_30d: activeUsers30d || 0,
          top_user_network: topUserNetwork,
          top_tx_network: topTxNetwork,
          last_updated_at: platformStats.updatedAt || null,
        },
        percentages: {
          users: {
            public: getPercent(normalizedUsers.public, normalizedUsers.total),
            testnet: getPercent(normalizedUsers.testnet, normalizedUsers.total),
            local: getPercent(normalizedUsers.local, normalizedUsers.total),
            futurenet: getPercent(
              normalizedUsers.futurenet,
              normalizedUsers.total
            ),
          },
          tx: {
            public: getPercent(tx.public, tx.total),
            testnet: getPercent(tx.testnet, tx.total),
            local: getPercent(tx.local, tx.total),
            futurenet: getPercent(tx.futurenet, tx.total),
          },
          feature_used: {
            studio: getPercent(feature_used.studio, feature_used.total),
            ide: getPercent(feature_used.ide, feature_used.total),
          },
        },
      },
    });
  } catch (error) {
    console.error("Error fetching platform stats:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch platform statistics",
    });
  }
}

module.exports = { getPlatformStats };
