// backend/config/database.js
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false, // Prevents terminal log cluttering
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false // Required for remote Supabase connections
    }
  },
  logging: false,
});

export default sequelize;