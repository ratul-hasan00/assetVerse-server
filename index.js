// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
const admin = require("firebase-admin");
const stripe = require('stripe')(process.env.STRIPE_SECRET);


// const serviceAccount = require(process.env.FIREBASE_ADMIN_SDK);

admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN_SDK))
});

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: [process.env.SITE_DOMAIN], credentials: true }));
app.use(express.json());

// MongoDB
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

// Global collections
let usersCollection;
let assetsCollection;
let requestsCollection;
let assignedAssetsCollection;
let packagesCollection;
let affiliationsCollection;
let paymentsCollection;


// ================= MIDDLEWARE =================

// Firebase Token Verification
const verifyFirebaseToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).send({ message: "Unauthorized access" });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).send({ message: "Unauthorized access" });

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.token_email = decoded.email;
        next();
    } catch (err) {
        return res.status(401).send({ message: "Unauthorized access" });
    }
};

// HR-only middleware
const verifyHR = async (req, res, next) => {
    try {
        const email = req.token_email;
        if (!email) return res.status(401).send({ message: "Unauthorized" });

        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(401).send({ message: "User not found" });
        if (user.role !== "hr") return res.status(403).send({ message: "HR access only" });

        req.user = user; // attach user info
        next();
    } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
    }
};

// Root
app.get('/', (req, res) => res.send("AssetVerse server running"));

// ================= RUN SERVER =================
async function run() {
    try {
        await client.connect();
        const db = client.db('asset_db');

        // Initialize collections
        usersCollection = db.collection('users');
        assetsCollection = db.collection('assets');
        requestsCollection = db.collection('requests');
        assignedAssetsCollection = db.collection('assignedAssets');
        packagesCollection = db.collection('packages');
        affiliationsCollection = db.collection('employeeAffiliations');
        paymentsCollection = db.collection('payments');

        console.log("Connected to MongoDB");

        /* ================= USERS ================= */
        // Register
        app.post('/users', async (req, res) => {
            try {
                const user = req.body;
                if (!user.email || !user.name || !user.role) return res.status(400).send({ message: "Missing required fields" });

                const exists = await usersCollection.findOne({ email: user.email });
                if (exists) return res.status(400).send({ message: "User already exists" });

                if (user.password) {
                    user.password = await bcrypt.hash(user.password, 10);
                }

                if (user.role === "hr") {
                    user.packageLimit = 5;
                    user.currentEmployees = 0;
                    user.subscription = "basic";
                }

                user.createdAt = new Date();
                user.updatedAt = new Date();

                const result = await usersCollection.insertOne(user);
                res.send({ message: "User registered successfully", userId: result.insertedId });
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: err.message });
            }
        });

        // // Login
        app.post('/login', async (req, res) => {
            try {
                const { email, password } = req.body;
                if (!email || !password) return res.status(400).send({ message: "Email and password required" });

                const user = await usersCollection.findOne({ email });
                if (!user) return res.status(401).send({ message: "Invalid credentials" });

                const match = await bcrypt.compare(password, user.password);
                if (!match) return res.status(401).send({ message: "Invalid credentials" });

                const token = jwt.sign(
                    { email: user.email, role: user.role },
                    process.env.JWT_SECRET || "supersecretkey",
                    { expiresIn: '1d' }
                );

                res.send({
                    token,
                    user: {
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        companyName: user.companyName || null,
                        companyLogo: user.companyLogo || null,
                        photoURL: user.profileImage || null
                    }
                });
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Login failed" });
            }
        });

        // // Get user by email
        app.get('/users/:email', async (req, res) => {
            const user = await usersCollection.findOne(
                { email: req.params.email },
                { projection: { password: 0 } }
            );
            if (!user) return res.status(404).send({ message: "User not found" });
            res.send(user);
        });

        // Update user info
        app.put('/users/:email', async (req, res) => {
            try {
                const { displayName, photoURL } = req.body;
                if (!displayName) return res.status(400).send({ message: "Name is required" });

                const updateData = { name: displayName, updatedAt: new Date() };
                if (photoURL) updateData.profileImage = photoURL;

                const result = await usersCollection.updateOne({ email: req.params.email }, { $set: updateData });
                if (result.modifiedCount === 0) return res.status(404).send({ message: "User not found or data unchanged" });

                res.send({ message: "User info updated successfully" });
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Failed to update user info" });
            }
        });

        // /* ================= ASSETS ================= */
        // // Get all assets with pagination
        // app.get('/assets', async (req, res) => {
        //     try {
        //         const page = parseInt(req.query.page) || 1;
        //         const limit = parseInt(req.query.limit) || 10;
        //         const skip = (page - 1) * limit;

        //         const assets = await assetsCollection.find().skip(skip).limit(limit).toArray();
        //         const total = await assetsCollection.countDocuments();
        //         const totalPages = Math.ceil(total / limit);

        //         res.send({ total, page, limit, totalPages, assets });
        //     } catch (err) {
        //         console.error(err);
        //         res.status(500).send({ message: "Failed to fetch assets" });
        //     }
        // });

        // // HR-only: Add asset
        // app.post('/assets', verifyFirebaseToken, verifyHR, async (req, res) => {
        //     try {
        //         const asset = req.body;
        //         asset.dateAdded = new Date();
        //         asset.availableQuantity = asset.productQuantity;
        //         asset.hrEmail = req.user.email;

        //         const result = await assetsCollection.insertOne(asset);
        //         res.send({ message: "Asset added successfully", assetId: result.insertedId });
        //     } catch (err) {
        //         console.error(err);
        //         res.status(500).send({ message: "Failed to add asset" });
        //     }
        // });

        // // HR-only: Update asset
        // app.put('/assets/:id', verifyFirebaseToken, verifyHR, async (req, res) => {
        //     try {
        //         const result = await assetsCollection.updateOne(
        //             { _id: new ObjectId(req.params.id) },
        //             { $set: req.body }
        //         );
        //         res.send({ message: "Asset updated successfully", modifiedCount: result.modifiedCount });
        //     } catch (err) {
        //         console.error(err);
        //         res.status(500).send({ message: "Failed to update asset" });
        //     }
        // });

        // // HR-only: Delete asset
        // app.delete('/assets/:id', verifyFirebaseToken, verifyHR, async (req, res) => {
        //     try {
        //         const result = await assetsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        //         res.send({ message: "Asset deleted successfully", deletedCount: result.deletedCount });
        //     } catch (err) {
        //         console.error(err);
        //         res.status(500).send({ message: "Failed to delete asset" });
        //     }
        // });

        // /* ================= ASSIGNED ASSETS ================= */
        // app.get('/assigned-assets', async (req, res) => {
        //     try {
        //         const email = req.query.email;
        //         const result = await assignedAssetsCollection.find({ requesterEmail: email }).toArray();
        //         res.send(result);
        //     } catch (err) {
        //         console.error(err);
        //         res.status(500).send({ message: "Failed to fetch assigned assets" });
        //     }
        // });

        // app.put('/assigned-assets/:id', async (req, res) => {
        //     try {
        //         const id = req.params.id;
        //         const asset = await assignedAssetsCollection.findOne({ _id: new ObjectId(id) });
        //         if (!asset) return res.status(404).send({ message: "Assigned asset not found" });
        //         if (asset.status === "returned") return res.status(400).send({ message: "Asset already returned" });

        //         await assignedAssetsCollection.updateOne(
        //             { _id: new ObjectId(id) },
        //             { $set: { status: "returned", returnDate: new Date() } }
        //         );

        //         await assetsCollection.updateOne(
        //             { _id: new ObjectId(asset.assetId) },
        //             { $inc: { availableQuantity: 1 } }
        //         );

        //         res.send({ message: "Asset returned successfully" });
        //     } catch (err) {
        //         console.error(err);
        //         res.status(500).send({ message: "Failed to return asset" });
        //     }
        // });

        // /* ================= EMPLOYEE AFFILIATIONS ================= */
        // app.get('/employee-affiliations', async (req, res) => {
        //     try {
        //         const email = req.query.email;
        //         const affiliations = await affiliationsCollection
        //             .find({ employeeEmail: email, status: "active" })
        //             .project({ companyName: 1, companyLogo: 1, hrEmail: 1 })
        //             .toArray();
        //         res.send(affiliations);
        //     } catch (err) {
        //         console.error(err);
        //         res.status(500).send({ message: "Failed to fetch affiliations" });
        //     }
        // });

        // app.delete('/employee-affiliation', async (req, res) => {
        //     try {
        //         const { employeeEmail, companyName, hrEmail } = req.body;
        //         if (!employeeEmail || !companyName || !hrEmail) return res.status(400).send({ message: "Missing required fields" });

        //         const result = await affiliationsCollection.deleteOne({ employeeEmail, companyName, hrEmail });
        //         if (result.deletedCount === 0) return res.status(404).send({ message: "Affiliation not found" });

        //         await usersCollection.updateOne({ email: hrEmail }, { $inc: { currentEmployees: -1 } });
        //         res.send({ message: "Employee removed from company successfully" });
        //     } catch (err) {
        //         console.error(err);
        //         res.status(500).send({ message: "Failed to remove employee" });
        //     }
        // });

        // app.get('/company-employees', async (req, res) => {
        //     try {
        //         const companyName = req.query.company;
        //         const employees = await affiliationsCollection.find({ companyName, status: "active" }).toArray();
        //         const employeeEmails = employees.map(e => e.employeeEmail);
        //         const users = await usersCollection.find({ email: { $in: employeeEmails } }).project({
        //             name: 1, email: 1, profileImage: 1, position: 1, dateOfBirth: 1, createdAt: 1
        //         }).toArray();
        //         res.send(users);
        //     } catch (err) {
        //         console.error(err);
        //         res.status(500).send({ message: "Failed to fetch company employees" });
        //     }
        // });

        // /* ================= REQUESTS ================= */
        // app.get('/requests', async (req, res) => {
        //     try {
        //         const hrEmail = req.query.hrEmail;
        //         const userEmail = req.query.userEmail;
        //         const query = {};
        //         if (hrEmail) query.hrEmail = hrEmail;
        //         if (userEmail) query.requesterEmail = userEmail;
        //         const requests = await requestsCollection.find(query).toArray();
        //         res.send(requests);
        //     } catch (err) {
        //         console.error(err);
        //         res.status(500).send({ message: "Failed to fetch requests" });
        //     }
        // });

        // app.post('/requests', async (req, res) => {
        //     try {
        //         const request = req.body;
        //         if (!request.assetId || !request.assetName || !request.requesterEmail || !request.hrEmail)
        //             return res.status(400).send({ message: "Missing required fields" });

        //         request.requestDate = new Date();
        //         request.requestStatus = "pending";

        //         const existingRequest = await requestsCollection.findOne({
        //             assetId: request.assetId,
        //             requesterEmail: request.requesterEmail,
        //             requestStatus: "pending"
        //         });

        //         if (existingRequest) return res.status(400).send({ message: "You already have a pending request for this asset" });

        //         const result = await requestsCollection.insertOne(request);
        //         res.send({ success: true, insertedId: result.insertedId });
        //     } catch (err) {
        //         console.error(err);
        //         res.status(500).send({ message: "Failed to create request" });
        //     }
        // });

        // app.put('/requests/:id', async (req, res) => {
        //     try {
        //         const id = req.params.id;
        //         const { requestStatus, processedBy } = req.body;
        //         const requestItem = await requestsCollection.findOne({ _id: new ObjectId(id) });
        //         if (!requestItem) return res.status(404).send({ message: "Request not found" });

        //         const hr = await usersCollection.findOne({ email: requestItem.hrEmail });
        //         const alreadyAffiliated = await affiliationsCollection.findOne({
        //             employeeEmail: requestItem.requesterEmail,
        //             hrEmail: requestItem.hrEmail
        //         });

        //         if (!alreadyAffiliated && hr.currentEmployees >= hr.packageLimit) {
        //             return res.status(403).send({ message: "Package limit reached" });
        //         }

        //         await requestsCollection.updateOne(
        //             { _id: new ObjectId(id) },
        //             { $set: { requestStatus, processedBy, approvalDate: new Date() } }
        //         );

        //         if (requestStatus === "approved") {
        //             if (!alreadyAffiliated) {
        //                 const asset = await assetsCollection.findOne({ _id: new ObjectId(requestItem.assetId) });

        //                 await affiliationsCollection.insertOne({
        //                     employeeEmail: requestItem.requesterEmail,
        //                     employeeName: requestItem.requesterName,
        //                     hrEmail: requestItem.hrEmail,
        //                     companyName: requestItem.companyName,
        //                     companyLogo: asset?.companyLogo || "",
        //                     affiliationDate: new Date(),
        //                     status: "active"
        //                 });

        //                 await usersCollection.updateOne({ email: requestItem.hrEmail }, { $inc: { currentEmployees: 1 } });
        //             }

        //             await assignedAssetsCollection.insertOne({
        //                 ...requestItem,
        //                 assignmentDate: new Date(),
        //                 status: "assigned"
        //             });

        //             await assetsCollection.updateOne(
        //                 { _id: new ObjectId(requestItem.assetId) },
        //                 { $inc: { availableQuantity: -1 } }
        //             );
        //         }

        //         res.send({ success: true });
        //     } catch (err) {
        //         console.error(err);
        //         res.status(500).send({ message: "Failed to update request" });
        //     }
        // });

        // /* ================= PACKAGES ================= */
        // app.get('/packages', async (req, res) => {
        //     res.send(await packagesCollection.find().toArray());
        // });

    } catch (err) {
        console.error("MongoDB connection failed", err);
    }
}

// ================= PAYMENT RELATED API'S =================
// server.js
app.get('/payments', async (req, res) => {
    try {
        const email = req.query.email;
        const payments = await paymentsCollection
            .find({ hrEmail: email })
            .sort({ paymentDate: -1 })
            .toArray();
        res.send(payments);
    } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch payments" });
    }
});

app.post('/create-checkout-session',  async (req, res) => {
    try {
        const paymentInfo = req.body;
        const amount = parseInt(paymentInfo.cost) * 100;

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        unit_amount: amount,
                        product_data: {
                            name: paymentInfo.parcelName
                        }
                    },
                    quantity: 1,
                },
            ],
            customer_email: paymentInfo.senderEmail,
            mode: 'payment',
            metadata: {
                parcelId: paymentInfo.parcelId
            },
            success_url: `${process.env.SITE_DOMAIN}/dashboard/upgrade-success`,
            cancel_url: `${process.env.SITE_DOMAIN}/dashboard/upgrade-cancelled`,
        });

        // Store payment info in MongoDB
        await paymentsCollection.insertOne({
            hrEmail: paymentInfo.senderEmail,
            packageName: paymentInfo.parcelName,
            amount: paymentInfo.cost,
            parcelId: paymentInfo.parcelId,
            transactionId: `TXN-${Date.now()}`,
            status: "pending", // will update to "completed" after actual Stripe payment
            createdAt: new Date()
        });

        console.log(session);
        res.send({ url: session.url });
    } catch (err) {
        console.error("Stripe / Payment error:", err);
        res.status(500).send({ message: "Failed to create checkout session" });
    }
});

// Upgrade HR package after successful payment
// app.patch('/upgrade-package', verifyFirebaseToken, async (req, res) => {
//     try {
//         const { packageName, employeeLimit, amount } = req.body;
//         const hrEmail = req.token_email;

//         if (!packageName || !employeeLimit || !amount) {
//             return res.status(400).send({ message: "Missing package info" });
//         }

//         await usersCollection.updateOne(
//             { email: hrEmail },
//             {
//                 $set: {
//                     subscription: packageName,
//                     packageLimit: employeeLimit,
//                     updatedAt: new Date()
//                 }
//             }
//         );

//         await paymentsCollection.insertOne({
//             hrEmail,
//             packageName,
//             employeeLimit,
//             amount,
//             transactionId: `TXN-${Date.now()}`,
//             paymentDate: new Date(),
//             status: "completed"
//         });

//         res.send({ success: true });

//     } catch (error) {
//         console.error("Upgrade error:", error);
//         res.status(500).send({ message: "Failed to upgrade package" });
//     }
// });



// Start server after MongoDB is ready
run().then(() => {
    app.listen(port, () => console.log(`AssetVerse server running on port ${port}`));
}).catch(console.error);
