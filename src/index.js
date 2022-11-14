import express from 'express'
import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'
import cors from 'cors'
import joi from 'joi'

dotenv.config();

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

try {
    await mongoClient.connect();
    db = mongoClient.db('DIRETORIOOOO')
} catch (err) {
    console.log("Erro no mongo.conect", err)
}

const app = express();
app.use(cors());
app.use(express.json());
