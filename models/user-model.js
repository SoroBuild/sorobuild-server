const mongoose = require("mongoose");
const { Schema } = mongoose;

const userStatSchema = new Schema(
  {
    address: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    credit: {
      type: Number,
      default: 0,
    },
    tx: {
      public: { type: Number, default: 0 },
      testnet: { type: Number, default: 0 },
      local: { type: Number, default: 0 },
      futurenet: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

const platformStatsSchema = new Schema(
  {
    key: {
      type: String,
      default: "global",
      unique: true,
    },
    users: {
      public: { type: Number, default: 0 },
      testnet: { type: Number, default: 0 },
      local: { type: Number, default: 0 },
      futurenet: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    tx: {
      public: { type: Number, default: 0 },
      testnet: { type: Number, default: 0 },
      local: { type: Number, default: 0 },
      futurenet: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

const UserStats = mongoose.model("userStats", userStatSchema);
const PlatformStats = mongoose.model("platformStats", platformStatsSchema);

module.exports = { UserStats, PlatformStats };
