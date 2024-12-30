const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

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
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}


app.get('/geojson', async (req, res) => {
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


app.post('/update-countries', async (req, res) => {
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'Updates must be an array' });
    }

    const results = await Promise.all(updates.map(async (update) => {
      const { countryName, ...properties } = update;

      if (!countryName) {
        return { countryName, success: false, error: 'Country name is missing' };
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

      return {
        countryName,
        success: result.modifiedCount > 0,
      };
    }));

    res.json({ success: true, results });
  } catch (error) {
    console.error('Error updating countries:', error);
    res.status(500).json({ error: 'Could not update countries data' });
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
