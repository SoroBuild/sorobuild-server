const mongoose = require("mongoose");
const { Schema } = mongoose;

const countByNetworkSchema = new Schema(
  {
    public: { type: Number, default: 0 },
    testnet: { type: Number, default: 0 },
    local: { type: Number, default: 0 },
    futurenet: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const featureUsedSchema = new Schema(
  {
    studio: { type: Number, default: 0 },
    ide: { type: Number, default: 0 },
  },
  { _id: false }
);

const actionSchema = new Schema(
  {
    deploy: { type: Number, default: 0 },
    invoke: { type: Number, default: 0 },
    read: { type: Number, default: 0 },
    upload: { type: Number, default: 0 },
    asset_ops: { type: Number, default: 0 },
    upgrade: { type: Number, default: 0 },
  },
  { _id: false }
);

const platformStatsSchema = new Schema(
  {
    key: {
      type: String,
      default: "global",
      unique: true,
      index: true,
    },
    users: {
      type: countByNetworkSchema,
      default: () => ({}),
    },
    tx: {
      type: countByNetworkSchema,
      default: () => ({}),
    },
    feature_used: {
      type: featureUsedSchema,
      default: () => ({}),
    },
    action: {
      type: actionSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

const PlatformStats = mongoose.model("platformStats", platformStatsSchema);

module.exports = { PlatformStats };
