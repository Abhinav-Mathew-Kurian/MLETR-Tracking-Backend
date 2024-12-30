const { MongoClient } = require("mongodb");

const uri =
  "mongodb+srv://map:map@cluster0.afflo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const countryData = [
   
  {
    name: "United Arab Emirates",
    status: "MLETR LEVEL 3",
    mletr_level: 3,
    notes: "The UAE has successfully implemented MLETR principles, becoming a leader in digital trade facilitation in the Middle East.",
    image: "https://upload.wikimedia.org/wikipedia/commons/c/cb/Flag_of_the_United_Arab_Emirates.svg",
    bgImage: "https://media.istockphoto.com/id/467829216/photo/dubai-marina.jpg?s=612x612&w=0&k=20&c=5KNh7wGSoP9i-UJzT-LtUfXgLHKKoBlPAK67R0LHRQY=",
    description: `The United Arab Emirates has made significant advancements in adopting the MLETR framework. It is among the first countries in the Middle East to pilot MLETR-enabled trade transactions. The country's efforts focus on leveraging technology to streamline trade finance and fintech solutions while maintaining alignment with international standards.`,
    point1: "The UAE piloted the first MLETR-enabled trade transaction with Singapore, showcasing its commitment to international trade innovation.",
    point2: "The Financial Services Regulatory Authority (FSRA) of Abu Dhabi Global Market (ADGM) enacted the Electronic Transactions Regulations 2021 to implement MLETR.",
    point3: "The application of MLETR in the UAE focuses on trade financing and financial technology (fintech).",
    journey1: "In September 2020, consultations for adopting MLETR began, culminating in the enactment of the Electronic Transactions Regulations 2021.",
    journey2: "On 25 February 2021, the UAE officially enacted Part 5 of the Regulations, embedding MLETR principles without significant variations.",
    journey3: "The UAE aims to expand MLETR applications beyond trade financing to broader financial and trade ecosystems through partnerships with international organizations.The UAE is working on blockchain-based trade platforms to ensure transparency and secure record-keeping for electronic transactions.",
  },
  
 
  ];
  
  
  

async function updateMLETRStatus() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db("MAP_APP");
    const collection = db.collection("worldgeojson");

    let successCount = 0;
    let failureCount = 0;

    // Process each country update
    for (const country of countryData) {
      try {
        const updateFields = Object.fromEntries(
          Object.entries(country)
            .filter(([key]) => key !== "name")
            .map(([key, value]) => [`features.$.properties.${key}`, value])
        );

        const result = await collection.updateOne(
          { "features.properties.name": country.name },
          { $set: updateFields }
        );

        if (result.matchedCount > 0) {
          console.log(
            `✅ Successfully updated ${country.name} with status: ${country.status}`
          );
          successCount++;
        } else {
          console.log(`❌ Country not found: ${country.name}`);
          failureCount++;
        }
      } catch (error) {
        console.error(`Error updating ${country.name}:`, error);
        failureCount++;
      }
    }

    console.log("\nUpdate Summary:");
    console.log(`Total countries processed: ${countryData.length}`);
    console.log(`Successful updates: ${successCount}`);
    console.log(`Failed updates: ${failureCount}`);
  } catch (error) {
    console.error("Error connecting to database:", error);
  } finally {
    await client.close();
    console.log("Database connection closed");
  }
}

// Run the update script
updateMLETRStatus();
