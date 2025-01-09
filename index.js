const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const Auth = require('./auth');  
const axios = require('axios');
const fileUploadRoutes = require('./fileUpload');

const app = express();
const PORT = 5001;
const uri = 'mongodb+srv://map:map@cluster0.afflo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const client = new MongoClient(uri);
let db;

app.use(cors());
app.use(express.json());

async function connectToDatabase() {
  try {
    await client.connect();
    db = client.db('MAP_APP');
    console.log('Connected to MongoDB');
    app.use('/api', fileUploadRoutes(db));
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}



app.post('/register', async (req, res) => {
  try {
    const { email, name, password } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = {
      email,
      name,
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('users').insertOne(user);
    
    try {
      // https://mletr-tracker-pki.onrender.com/generate-certificate'
      const pkiResponse = await axios.post('https://mletr-tracker-pki.onrender.com/generate-certificate', {
        userId: result.insertedId.toString(),
        email: email
      });

      const token = Auth.generateToken(result.insertedId.toString());

      res.status(201).json({
        message: 'User registered successfully',
        token,
        certificate: pkiResponse.data.certificate,
        privateKey: pkiResponse.data.privateKey,
        user: {
          id: result.insertedId,
          email: user.email,
          name: user.name
        }
      });
    } catch (pkiError) {
      console.error('PKI Server error:', pkiError);
     
      const token = Auth.generateToken(result.insertedId.toString());
      res.status(201).json({
        message: 'User registered successfully (without certificate)',
        token,
        user: {
          id: result.insertedId,
          email: user.email,
          name: user.name
        }
      });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }


    const certificate = await db.collection('pki_certificates').findOne({
      userId: user._id.toString(),
      email: email
    });

    if (!certificate) {
      return res.status(401).json({ error: 'Certificate not found. Please register again.' });
    }

    if (new Date() > new Date(certificate.validTo)) {
      return res.status(401).json({ error: 'Certificate expired. Please request a new certificate.' });
    }

    const token = Auth.generateToken(user._id.toString());

    res.json({
      message: 'Logged in successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      },
      certificate: {
        serialNumber: certificate.serialNumber,
        signature:certificate.signature,
        validTo: certificate.validTo
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});


app.get('/geojson', Auth.authenticateToken, async (req, res) => {
  try {
    const geojsonData = await db.collection('worldgeojson').find({}).toArray();
    if (geojsonData.length === 0) {
      return res.status(404).json({ error: 'No GeoJSON data found' });
    }
    res.json(geojsonData);
  } catch (error) {
    console.error('Error fetching GeoJSON:', error);
    res.status(500).json({ error: 'Could not fetch data' });
  }
});

app.post('/update-country', async (req, res) => {
  try {
    const { countryName, ...properties } = req.body;

    if (!countryName) {
      return res.status(400).json({ error: 'Country name is required' });
    }

    const result = await db.collection('worldgeojson').updateOne(
      { 'features.properties.name': countryName },
      { $set: Object.fromEntries(
          Object.entries(properties).map(([key, value]) => [
            `features.$.properties.${key}`, value
          ])
        )
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Country not found' });
    }

    res.json({
      success: true,
      message: `Updated properties for ${countryName}`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error('Error updating country:', error);
    res.status(500).json({ error: 'Could not update country data' });
  }
});




connectToDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}).catch(console.error);

process.on('SIGINT', async () => {
  try {
    await client.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
});