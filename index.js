require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const app = express();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const corsOptions = {
  origin: [
    "https://booknest-library.web.app",
    "https://booknest-library.firebaseapp.com ",
    "http://localhost:5173",
  ],
  credentials: true,
  optionalSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
const port = process.env.PORT || 5000;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.3meil.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized Access" });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: true, message: "Forbidden Access" });
    }
    req.decoded = decoded;
    next();
  });
};

app.get("/", (req, res) => {
  res.send("BookNest...");
});
async function run() {
  try {
    // await client.connect();
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
    const database = client.db("BookNest");
    const booksCollection = database.collection("books");
    const borrowedBooksCollection = database.collection("borrowedBooks");

    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    app.get("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          maxAge: 0,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    app.post("/add-book", verifyToken, async (req, res) => {
      const book = req.body;
      const result = await booksCollection.insertOne(book);
      res.send(result);
    });

    app.get("/books", async (req, res) => {
      const category = req.query.category;
      const query = category ? { category } : {};
      const result = await booksCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/available-books", async (req, res) => {
      const query = { quantity: { $gt: 0 } };
      const result = await booksCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/book/:id", verifyToken, async (req, res) => {
      const decodedEmail = req.decoded?.email;
      const id = req.params?.id;
      const email = req.query?.email;

      if (email !== decodedEmail) {
        return res
          .status(401)
          .send({ error: true, message: "Unauthorized Access" });
      }

      const book = await booksCollection.findOne({ _id: new ObjectId(id) });

      let isBorrowed = false;
      if (email) {
        const borrowedBook = await borrowedBooksCollection.findOne({
          borrowerEmail: email,
          bookId: id,
        });
        isBorrowed = !!borrowedBook;
      }
      res.send({ ...book, isBorrowed });
    });

    app.put("/update-book/:id", verifyToken, async (req, res) => {
      const id = req.params?.id;
      const book = req.body;
      const query = { _id: new ObjectId(id) };
      const result = await booksCollection.updateOne(query, { $set: book });
      res.send(result);
    });

    app.get("/borrowed-books", verifyToken, async (req, res) => {
      const decodedEmail = req.decoded?.email;
      const email = req.query?.email;
      if (email !== decodedEmail) {
        return res
          .status(401)
          .send({ error: true, message: "Unauthorized Access" });
      }
      const query = email ? { borrowerEmail: email } : {};
      const borrowedBooks = await borrowedBooksCollection.find(query).toArray();

      const bookIds = borrowedBooks.map((borrowedBook) => borrowedBook.bookId);
      const books = await booksCollection
        .find({ _id: { $in: bookIds.map((id) => new ObjectId(id)) } })
        .toArray();
      const result = borrowedBooks.map((borrowedBook) => {
        const book = books.find(
          (book) => book._id.toString() === borrowedBook?.bookId
        );
        return { ...borrowedBook, ...book };
      });
      res.send(result);
    });

    app.post("/borrow-book", verifyToken, async (req, res) => {
      const decodedEmail = req.decoded?.email;
      const borrowedBook = req.body;

      if (borrowedBook?.borrowerEmail !== decodedEmail) {
        return res
          .status(401)
          .send({ error: true, message: "Unauthorized Access" });
      }
      const count = await borrowedBooksCollection.countDocuments({
        borrowerEmail: borrowedBook?.borrowerEmail,
      });

      if (count >= 3) {
        res.send({ message: "You can't borrow more than 3 books" });
      } else {
        const bookId = borrowedBook?.bookId;
        const query = { _id: new ObjectId(bookId) };
        const updateQuantity = {
          $inc: {
            quantity: -1,
          },
        };
        const result = await booksCollection.updateOne(query, updateQuantity);
        if (result.modifiedCount === 1) {
          const insertedResult = await borrowedBooksCollection.insertOne(
            borrowedBook
          );
          res.send(insertedResult);
        } else {
          res.send({ message: "Failed to borrow book" });
        }
      }
    });

    app.patch("/return-book/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateQuantity = {
        $inc: {
          quantity: 1,
        },
      };
      const result = await booksCollection.updateOne(query, updateQuantity);
      if (result.modifiedCount === 1) {
        const deletedResult = await borrowedBooksCollection.deleteOne({
          bookId: id,
        });
        res.send(deletedResult);
      } else {
        res.send({ message: "Failed to return book" });
      }
    });
  } finally {
    //   await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
