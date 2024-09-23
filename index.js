const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 8000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { default: axios } = require("axios");

// socket implement
const http = require('http');
const { Server } = require("socket.io");
const { create } = require("domain");


// middleware
app.use(cors({
  origin: 'http://localhost:5173'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// socket implement
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ["GET", "POST"]
  }
})

// ---------------------------------------



// ---------------------------------------

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
    const notificationCollection = client.db("QuickShopBD").collection("notification");
    // const tnxId = new ObjectId().toString();
    const tnxId = `TNX${Date.now()}`;

    // jwt
    app.post("/jwt", async (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.VITE_IMG_API_KEY, { expiresIn: "1h" })
      res.send({ token })
    })

    // ========================================================================

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



    // =========================================================================

    // get all products
    app.get("/allProducts", async (req, res) => {
      const result = await productCollection.find().toArray();
      res.send(result);
    });

    app.get("/user-profile/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      // console.log('user-profile', email)
      const query = { email: email };
      const result = await allUserCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/user-order-history/:email', async (req, res) => {
      const email = req.params.email
      console.log('email checking', email)
      const query = { customar_email: email }
      const result = await paymentHistory.find(query).toArray()
      res.send(result)
    })

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
      const { email, password } = req.body;
      const newUser = {
        email,
        password,
        createdAt: new Date()
      }
      const result = await allUserCollection.insertOne(newUser);
      const notification = {
        message: 'New User Registred',
        user: {
          email: newUser.email
        },
        isRead: false,
        createdAt: new Date()
      }
      const notificationRusult = await notificationCollection.insertOne(notification)
      io.emit('newUser', notification)
      res.send({ result, notificationRusult })
    });


    app.get('/notification', async (req, res) => {
      const result = await notificationCollection.find({}).sort({ createdAt: -1 }).toArray()
      res.send(result)
    })

    // unread notification sum
    app.get('/notification/unread', async (req, res) => {
      const totalUnread = await notificationCollection.aggregate([
        { $match: { isRead: false } },
        {
          $group: {
            _id: null,
            totalUnreadCount: { $sum: 1 },
          }
        }
      ]).toArray()
      const unReadCount = totalUnread[0]?.totalUnreadCount || 0

      res.status(200).json({ totalUnreadNotificaton: unReadCount });
    })

    //  unread notification update
    app.patch('/notification-unread-update', async (req, res) => {
      const unreadCheck = { isRead: false }
      const updateData = {
        $set: {
          isRead: true
        }
      }
      const result = await notificationCollection.updateMany(unreadCheck, updateData)
      res.send(result)
    })



    // get all users
    app.get("/all-users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await allUserCollection.find().toArray();
      res.send(result);
    });

    app.get('/order-history', async (req, res) => {
      const result = await paymentHistory.find().toArray()
      res.send(result)
    })


    app.get('/order-items/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await paymentHistory.findOne(query)
      res.send(result)
    })



    app.get('/dashboard-overview', async (req, res) => {
      try {

        const currentTime = new Date()
        const last24Hours = new Date(currentTime - 24 * 60 * 60 * 1000)
        const lastWeek = new Date(currentTime - 7 * 24 * 60 * 60 * 1000)
        const lastMonth = new Date(currentTime - 30 * 24 * 60 * 60 * 1000)
        const lastYear = new Date(currentTime - 365 * 24 * 60 * 60 * 1000)
        // 7 day data
        const last7Day = new Date()
        last7Day.setDate(last7Day.getDate() - 7);


        const revenueData = await paymentHistory.aggregate([
          {
            $match: {
              createdAt: { $gte: last7Day }
            }
          },
          {
            $group: {
              _id: { $dayOfWeek: "$createdAt" },
              totalRevenue: { $sum: '$amount' }
            }
          },
          {
            $sort: { _id: 1 }
          }
        ]).toArray()




        const calculateCustomarByCountry = async (collection, timeRange) => {
          const customarData = await collection.aggregate([
            { $match: { createdAt: { $gte: timeRange } } },
            {
              $group: { _id: "$country", totalCustomers: { $sum: 1 } }
            },
            { $sort: { totalCustomers: -1 } }
          ]).toArray()
          return customarData
        }


        const calculateTotal = async (collection, timeRange) => {
          const count = await collection.countDocuments({ createdAt: { $gte: timeRange } })
          const totalAmount = await collection.aggregate([
            { $match: { createdAt: { $gte: timeRange } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]).toArray()
          return {
            count,
            totalAmount: totalAmount.length > 0 ? totalAmount[0].total : 0
          }
        };




        const last24HoursCountry = await calculateCustomarByCountry(allUserCollection, last24Hours)
        const lastWeekCountry = await calculateCustomarByCountry(allUserCollection, lastWeek)
        const lastMonthCountry = await calculateCustomarByCountry(allUserCollection, lastMonth)
        const lastYearCountry = await calculateCustomarByCountry(allUserCollection, lastYear)


        const last24HoursRevenue = await calculateTotal(paymentHistory, last24Hours)
        const lastWeekRevenue = await calculateTotal(paymentHistory, lastWeek)
        const lastMonthRevenue = await calculateTotal(paymentHistory, lastMonth)
        const lastYearRevenue = await calculateTotal(paymentHistory, lastYear)

        const last24HoursCustomars = await allUserCollection.countDocuments({ createdAt: { $gte: last24Hours } });
        const lastWeekCustomars = await allUserCollection.countDocuments({ createdAt: { $gte: lastWeek } });
        const lastMonthCustomars = await allUserCollection.countDocuments({ createdAt: { $gte: lastMonth } });
        const lastYearCustomars = await allUserCollection.countDocuments({ createdAt: { $gte: lastYear } });


        const last24HoursTransactions = await paymentHistory.countDocuments({ createdAt: { $gte: last24Hours } });
        const lastWeekTransactions = await paymentHistory.countDocuments({ createdAt: { $gte: lastWeek } });
        const lastMonthTransactions = await paymentHistory.countDocuments({ createdAt: { $gte: lastMonth } });
        const lastYearTransactions = await paymentHistory.countDocuments({ createdAt: { $gte: lastYear } });

        const last24HoursProducts = await productCollection.countDocuments({ createdAt: { $gte: last24Hours } });
        const lastWeekProducts = await productCollection.countDocuments({ createdAt: { $gte: lastWeek } });
        const lastMonthProducts = await productCollection.countDocuments({ createdAt: { $gte: lastMonth } });
        const lastYearProducts = await productCollection.countDocuments({ createdAt: { $gte: lastYear } });




        res.status(200).json({

          totalRevenue: {
            last24Hours: last24HoursRevenue.totalAmount,
            lastWeek: lastWeekRevenue.totalAmount,
            lastMonth: lastMonthRevenue.totalAmount,
            lastYear: lastYearRevenue.totalAmount,
          },
          totalCustomers: {
            last24Hours: last24HoursCustomars,
            lastWeek: lastWeekCustomars,
            lastMonth: lastMonthCustomars,
            lastYear: lastYearCustomars
          },
          totalTransactions: {
            last24Hours: last24HoursTransactions,
            lastWeek: lastWeekTransactions,
            lastMonth: lastMonthTransactions,
            lastYear: lastYearTransactions
          },
          totalProducts: {
            last24Hours: last24HoursProducts,
            lastWeek: lastWeekProducts,
            lastMonth: lastMonthProducts,
            lastYear: lastYearProducts
          },
          totalCountry: {
            last24Hours: last24HoursCountry,
            lastWeek: lastWeekCountry,
            lastMonth: lastMonthCountry,
            lastYear: lastYearCountry
          },
          totalWeekRevenue: {
            revenueData
          }

        })
      } catch (error) {
        res.status(500).json('error', error.message)
      }

    })




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
          city: update.city,
          state: update.state,
          postal_code: update.postal_code,
          country: update.country,
          updateAt: new Date()
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


    // TODO

    // app.get('customar', async (req, res) => {

    // })

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




      // date create
      const date = new Date()
      const year = date.getFullYear()
      const month = date.getMonth()
      const day = date.getDate()
      const currentDate = new Date(year, month, day)


      const saveData = {
        paymentId: tnxId,
        customar_name: paymentInfo.customar_name,
        customar_email: paymentInfo.customar_email,
        customar_address: paymentInfo.customar_address,
        amount: paymentInfo.amount,
        date: currentDate,
        createdAt: new Date(),
        updateAt: new Date(),
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

      const notification = {
        message: 'New Order',
        name: paymentInfo.customar_name,
        user: {
          email: paymentInfo.customar_email
        },
        transaction_id: tnxId,
        image: paymentInfo.image,
        isRead: false,
        createdAt: new Date()
      }

      await notificationCollection.insertOne(notification)

      io.emit('newOrder', notification)


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
      res.redirect(`http://localhost:5173/payment-success?tran_id=${successData.tran_id}`)
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


// -------------------------------------------------

io.on('connection', (socket) => {
  console.log('New client Connected');

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  })
})




// --------------------------------------------------

// --------------------------------------------------
app.get("/", (req, res) => {
  res.send("Welcome to Quick Shop");
});

server.listen(port, () => {
  console.log(`gadgets running on port ${port}`);
});
