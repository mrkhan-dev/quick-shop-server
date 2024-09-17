const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 8000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { default: axios } = require("axios");

// middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded());
// --------------------------------------------------

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.aeb0oh8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const productCollection = client.db("QuickShopBD").collection("AllProduct");
    const allUserCollection = client.db("QuickShopBD").collection("allUsers");
    const paymentHistory = client.db("QuickShopBD").collection("payment");
    // const tnxId = new ObjectId().toString();
    const tnxId = `TNX${Date.now()}`;


    // jwt
    app.post("/jwt", async (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.VITE_IMG_API_KEY, { expiresIn: "1h" })
      res.send({ token })
    })

    // middleware
    const verifyToken = (req, res, next) => {
      console.log("inside verify token", req.headers.authorization)
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "forbidden access" })
      }
      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.VITE_IMG_API_KEY, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next()
      })
    }


    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await allUserCollection.findOne(query)
      const isAdmin = user?.role === 'admin'
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next();
    }



    // get all products
    app.get("/allProducts", async (req, res) => {
      const result = await productCollection.find().toArray();
      res.send(result);
    });

    app.get("/user-profile/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      console.log('user-profile', email)
      const query = { email: email };
      const result = await allUserCollection.find(query).toArray();
      res.send(result);
    });

    // create admin (sk)

    app.get("/user/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'unauthorized access' })
      }
      const query = { email: email }
      const user = await allUserCollection.findOne(query)
      let admin = false
      if (user && user.role === 'admin') {
        admin = true
      }
      res.send({ admin });
    })


    app.get("/details/:id", async (req, res) => {
      const product = req.params.id;
      const query = { _id: new ObjectId(product) };
      const result = await productCollection.findOne(query);
      res.send(result);
    });

    app.post("/all-users", async (req, res) => {
      const users = req.body;
      const result = await allUserCollection.insertOne(users);
      res.send(result);
    });

    // get all users
    app.get("/all-users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await allUserCollection.find().toArray();
      res.send(result);
    });

    app.patch("/user-name-change/:email", async (req, res) => {
      const email = req.params.email;
      const { name } = req.body;
      const filter = { email: email };
      const option = { upsert: true };
      const updateDoc = {
        $set: {
          name: name,
        },
      };
      const result = await allUserCollection.updateOne(
        filter,
        updateDoc,
        option
      );
      res.send(result);
    });

    app.patch("/profile-update/:email", async (req, res) => {
      const email = req.params.email;
      const update = req.body;
      const filter = { email: email };
      const option = { upsert: true };
      const updateDoc = {
        $set: {
          name: update.name,
          address: update.address,
          mobileNumber: update.mobileNumber,
        },
      };
      const result = await allUserCollection.updateOne(
        filter,
        updateDoc,
        option
      );
      res.send(result);
    });

    app.patch("/user-image-update/:email", async (req, res) => {
      const email = req.params.email;
      const { image } = req.body;
      const filter = { email: email };
      const option = { upsert: true };
      const updateDoc = {
        $set: {
          image: image,
        },
      };
      const result = await allUserCollection.updateOne(
        filter,
        updateDoc,
        option
      );
      res.send(result);
    });

    // product update 
    app.patch("/product-update/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id
      const product = req.body
      const filter = { _id: new ObjectId(id) }
      const option = { upsert: true }
      const updateProduct = {
        $set: {
          name: product.name,
          price: product.price,
          description: product.description,
          percentOff: product.percentOff,
          category: product.category,
          brandName: product.brandName,
          image: product.image
        }
      }
      const result = await productCollection.updateOne(filter, updateProduct, option)
      res.send(result)
    })

    // product add
    app.post("/product-add", verifyToken, verifyAdmin, async (req, res) => {
      const product = req.body
      const result = await productCollection.insertOne(product)
      res.send(result)
    })

    // create payment getwaye
    app.post("/create-payment", async (req, res) => {
      // client data
      const paymentInfo = req.body;
      // initateData for sslComarce

      const products = paymentInfo.products

      const productName = products.map(product => product.product_name).join(", ")
      // const brand_name = products.map(product => product.brand_name).join(", ")
      const category = products.map(product => product.category).join(", ")



      const initateData = {
        store_id: "webwa66d6f4cb94fee",
        store_passwd: "webwa66d6f4cb94fee@ssl",
        total_amount: paymentInfo.amount,
        currency: paymentInfo.currency,
        tran_id: tnxId,
        success_url: "http://localhost:8000/success-payment",
        fail_url: "http://localhost:8000/payment-fail",
        cancel_url: "http://localhost:8000/payment-cancel",
        cus_name: paymentInfo.customar_name || 'None',
        cus_email: paymentInfo.customar_email || 'None',
        cus_add1: paymentInfo.customar_address || 'None',
        cus_add2: "Dhaka",
        cus_city: "Dhaka",
        cus_state: "Dhaka",
        cus_postcode: "1000",
        cus_country: "Bangladesh",
        cus_phone: "01711111111",
        cus_fax: "01711111111",
        shipping_method: "NO",
        product_name: productName,
        product_category: category,
        product_profile: "general",
        multi_card_name: "mastercard,visacard,amexcard",
        value_a: "ref001_A&",
        value_b: "ref002_B&",
        value_c: "ref003_C&",
        value_d: "ref004_D",
      };
      // post for asslcomarce
      const response = await axios({
        method: "POST",
        url: "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
        data: initateData,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
      });

      const saveData = {
        paymentId: tnxId,
        customar_name: paymentInfo.customar_name,
        customar_email: paymentInfo.customar_email,
        customar_address: paymentInfo.customar_address,
        amount: paymentInfo.amount,
        status: "Pending",
        order_details: products
      };
      // data save for mongodb database
      const save = await paymentHistory.insertOne(saveData);
      if (save) {
        res.send({
          paymentUrl: response.data.GatewayPageURL,
        });
      }
      // console.log(response)
    });

    app.post("/success-payment", async (req, res) => {
      const successData = req.body;
      if (successData.status !== "VALID") {
        throw new Error("Unauthorized payment, Invalid Payment");
      }
      // Update Database
      const query = {
        paymentId: successData.tran_id,
      };
      const update = {
        $set: {
          status: "Success",
        },
      };

      const updateData = await paymentHistory.updateOne(query, update);

      console.log("success-data", successData);
      console.log("Update-data", updateData);
      res.redirect("http://localhost:5173/payment-success")
    });

    app.post('/payment-fail', async (req, res) => {
      res.redirect('http://localhost:5173/payment-fail')
    })
    app.post('/payment-cancel', async (req, res) => {
      res.redirect('http://localhost:5173/payment-cancel')
    })

    app.delete("/product-delete/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id
      console.log(id)
      const query = { _id: new ObjectId(id) }
      console.log(query)
      const result = await productCollection.deleteOne(query)
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// --------------------------------------------------
app.get("/", (req, res) => {
  res.send("Welcome to Quick Shop");
});

app.listen(port, () => {
  console.log(`gadgets running on port ${port}`);
});
