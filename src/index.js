import express, { application } from "express";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import cors from "cors";
import joi from "joi";
import bcrypt from "bcrypt";
import dayjs from "dayjs";

const userSchema = joi.object({
  name: joi.string().min(1).required(),
});

const messageSchema = joi.object({
  to: joi.string().min(1).required(),
  text: joi.string().min(1).required(),
  type: joi.string().valid("message", "private_message"),
});

const app = express();
dotenv.config();
app.use(cors());
app.use(express.json());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

try {
  await mongoClient.connect();
} catch (err) {
  console.log("Erro no mongo.conect", err);
}

db = mongoClient.db("api-batepapo-uol");
const usersCollection = db.collection("users");
const messagesCollection = db.collection("messages");

// ROTAS:

app.post("/participants", async (req, res) => {
  const user = req.body;

  try {
    const userExists = await usersCollection.findOne({ name: user.name });
    if (userExists) {
      return res.status(409).send({
        message:
          "Já existe outro usuário com este nome, por favor escolha outro nome!",
      });
    }

    const { error } = userSchema.validate(user, { abortEarly: false });

    if (error) {
      const arrErrors = error.details.map((e) => e.message);
      return res.status(422).send(arrErrors);
    }
    const currentTime = Date.now();
    await usersCollection.insertOne({ ...user, lastStatus: currentTime });

    const message = {
      from: user.name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs(currentTime).format("HH:mm:ss"),
    };

    await messagesCollection.insertOne(message);
    res.status(201).send("Usuário cadastrado com sucesso!");
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const participants = await usersCollection.find({}).toArray();
    res.status(200).send(participants);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.post("/messages", async (req, res) => {
  const messageBody = req.body;
  const user = req.headers.user;

  if (!user) {
    return res.status(422).send({
      message: 'Por favor envie um header com campo "nome" informando o nome do usuário',
    });
  }

  try {
    const userExists = await usersCollection.findOne({ name: user });
    if (!userExists) {
      return res.status(422).send({
        message:
          "Não existe nenhum usuário com este nome, por favor escolha um usuário que já esteja cadastrado!",
      });
    }

    const { error } = messageSchema.validate(messageBody, {
      abortEarly: false,
    });
    if (error) {
      const arrErrors = error.details.map((e) => e.message);
      return res.status(422).send(arrErrors);
    }

    const currentTime = Date.now();
    const message = {
      ...messageBody,
      from: user,
      time: dayjs(currentTime).format("HH:mm:ss"),
    };

    await messagesCollection.insertOne(message);
    res.status(201).send("Mensagem enviada com sucesso!");
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get("/messages", async (req, res) => {
  const user = req.headers.user;
  const limit = parseInt(req.query.limit);

  if (!user) {
    return res.status(422).send({
      message: 'Por favor envie um header com campo "nome" informando o nome do usuário',
    });
  }

  try {
    const userExists = await usersCollection.findOne({ name: user });
    if (!userExists) {
      return res.status(422).send({
        message:
          "Não existe nenhum usuário com este nome, por favor escolha outro nome!",
      });
    }

    if (limit <= 0) {
      return res
        .status(400)
        .send("Informe um limite válido maior ou igual a 1");
    }

    let arrMessages = await messagesCollection
      .find({
        $or: [{ to: "Todos" }, { to: user }, { from: user }],
      })
      .sort({ time: -1 })
      .toArray();

    if (!limit || limit > arrMessages.length) {
      return res.status(200).send(arrMessages);
    }

    arrMessages = await messagesCollection
      .find({
        $or: [{ to: "Todos" }, { to: user }, { from: user }],
      })
      .sort({ time: -1 })
      .limit(limit)
      .toArray();

    res.status(200).send(arrMessages);
  } catch (err) {
    res.status(500).send(err);
  }
});

const port = 5000;
app.listen(port, () => console.log(`Server running in port: ${port}`));
