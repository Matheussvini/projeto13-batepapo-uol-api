import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import cors from "cors";
import joi from "joi";
import dayjs from "dayjs";
import { stripHtml } from "string-strip-html";

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

setInterval(rmvInactiveUsers, 15000);

app.post("/participants", async (req, res) => {
  let user = req.body;

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

    user = {name: stripHtml(user.name).result};
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
    res.status(500).send(err.message);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const participants = await usersCollection.find({}).toArray();
    res.status(200).send(participants);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/messages", async (req, res) => {
  let messageBody = req.body;
  let user = req.headers.user;

  if (!user) {
    return res.status(422).send({
      message:
        'Por favor envie um header na requisição com campo "user" informando o nome do usuário',
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

    user = stripHtml(user).result;
    messageBody = {
      to: stripHtml(messageBody.to).result,
      text: stripHtml(messageBody.text).result,
      type: stripHtml(messageBody.type).result,
    };

    const currentTime = Date.now();
    const message = {
      ...messageBody,
      from: user,
      time: dayjs(currentTime).format("HH:mm:ss"),
    };

    await messagesCollection.insertOne(message);
    res.status(201).send("Mensagem enviada com sucesso!");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/messages", async (req, res) => {
  const user = req.headers.user;
  const limit = parseInt(req.query.limit);

  if (!user) {
    return res.status(422).send({
      message:
        'Por favor envie um header na requisição com campo "user" informando o nome do usuário',
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
    res.status(500).send(err.message);
  }
});

app.post("/status", async (req, res) => {
  let user = req.headers.user;

  if (!user) {
    return res.status(422).send({
      message:
        'Por favor envie um header na requisição com campo "user" informando o nome do usuário',
    });
  }

  try {
    const userExists = await usersCollection.findOne({ name: user });
    if (!userExists) {
      return res.status(404).send({
        message: "Este usuário não está cadastrado",
      });
    }

    user = stripHtml(user).result;
    const currentTime = Date.now();
    await usersCollection.updateOne(
      { name: user },
      { $set: { lastStatus: currentTime } }
    );
    res
      .status(200)
      .send(`Status do participante ${user} atualizado com sucesso!`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.delete("/messages/:id", async (req, res) => {
  const user = req.headers.user;
  const id = req.params.id;

  if (!user) {
    return res.status(422).send({
      message:
        'Por favor envie um header na requisição com campo "user" informando o nome do usuário',
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
    const idIncludes = await messagesCollection.findOne({
      _id: new ObjectId(id),
    });
    if (!idIncludes) {
      return res.status(404).send("Não há nenhuma mensagem com esse id");
    }
    if (idIncludes.from !== user) {
      return res
        .status(401)
        .send(
          `Usuário ${user} não é o mesmo que enviou a mensagem, logo não possui autorização para excluí-la.`
        );
    }
    await messagesCollection.deleteOne({ _id: new ObjectId(id) });
    res.status(200).send("Mensagem apagada com sucesso!");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.put("/messages/:id", async (req, res) => {
  let user = req.headers.user;
  let id = req.params.id;
  let messageBody = req.body;

  if (!user) {
    return res.status(422).send({
      message:
        'Por favor envie um header na requisição com campo "user" informando o nome do usuário',
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

    const idIncludes = await messagesCollection.findOne({
      _id: new ObjectId(id),
    });
    if (!idIncludes) {
      return res.status(404).send("Não há nenhuma mensagem com esse id");
    }
    if (idIncludes.from !== user) {
      return res
        .status(401)
        .send(
          `Usuário ${user} não é o mesmo que enviou a mensagem, logo não possui autorização para edita-la.`
        );
    }

    const { error } = messageSchema.validate(messageBody, {
      abortEarly: false,
    });
    if (error) {
      const arrErrors = error.details.map((e) => e.message);
      return res.status(422).send(arrErrors);
    }

    user = stripHtml(user).result;
    id = stripHtml(id).result;
    messageBody = {
      to: stripHtml(messageBody.to).result,
      text: stripHtml(messageBody.text).result,
      type: stripHtml(messageBody.type).result,
    };

    const currentTime = Date.now();
    const newMessage = {
      ...messageBody,
      from: user,
      time: dayjs(currentTime).format("HH:mm:ss"),
    };

    await messagesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: newMessage }
    );
    res.status(201).send("Mensagem editada com sucesso!");
  } catch (err) {
    console.log("Catch", err)
    res.status(500).send(err.message);
  }
});

async function rmvInactiveUsers() {
  try {
    const downtime = 10000;
    const currentTime = Date.now();
    const limitTime = currentTime - downtime;

    const arrInactivUsers = await usersCollection
      .find({ lastStatus: { $lt: limitTime } })
      .toArray();

    arrInactivUsers.forEach(async (user) => {
      const message = {
        from: user.name,
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: dayjs(currentTime).format("HH:mm:ss"),
      };

      await usersCollection.deleteOne({ _id: new ObjectId(user._id) });
      await messagesCollection.insertOne(message);
    });
    //    console.log("Removed inactive users");
  } catch (err) {
    console.log("Error on removal inactive users: ", err.message);
  }
}

const port = 5000;
app.listen(port, () => console.log(`Server running in port: ${port}`));
