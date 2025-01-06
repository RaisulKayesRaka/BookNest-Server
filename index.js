require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(cors());
app.use(express.json());
const port = process.env.PORT || 5000;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.3meil.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

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

    app.post("/add-book", async (req, res) => {
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

    app.get("/book/:id", async (req, res) => {
      const id = req.params?.id;
      const email = req.query?.email;

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

    app.get("/borrowed-books", async (req, res) => {
      const email = req.query.email;
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

    app.post("/borrow-book", async (req, res) => {
      const borrowedBook = req.body;

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
    });

    app.patch("/return-book/:id", async (req, res) => {
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
