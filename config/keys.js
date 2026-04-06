require("dotenv").config();

const DB_PASSWORD = process.env.DB_PASSWORD;

// const MONGODB = {
//   MONGODB_URI: `mongodb+srv://${DB_USER}:${DB_PASSWORD}@cluster0.r9pru.mongodb.net/sorobuild?retryWrites=true&w=majority&appName=Cluster0/user`,
// };
const MONGODB = {
  MONGODB_URI: `mongodb+srv://sorobuild:${DB_PASSWORD}@sorobuild.htver3p.mongodb.net/users?appName=sorobuild`,
};

const KEYS = {
  ...MONGODB,
};

module.exports = KEYS;
