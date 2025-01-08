const express = require('express');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const { ObjectId, GridFSBucket } = require('mongodb');

const upload = multer({ dest: 'uploads/' });
const router = express.Router();

// Debug helper to inspect key format
const debugKey = (key, label) => {
  console.log(`\n=== ${label} ===`);
  console.log('Key type:', typeof key);
  console.log('Key length:', key.length);
  console.log('Key format:', key.includes('BEGIN RSA PRIVATE KEY') ? 'PKCS#1' : 
              key.includes('BEGIN PRIVATE KEY') ? 'PKCS#8' : 'Unknown');
  console.log('First 100 chars:', key.substring(0, 100));
};

// Helper function to validate and format private key
const formatPrivateKey = (privateKeyString) => {
  debugKey(privateKeyString, 'Input Private Key');
  
  try {
    // Remove any whitespace and ensure proper line breaks
    const cleanedKey = privateKeyString.trim();
    let formattedKey;
    
    if (cleanedKey.includes('-----BEGIN')) {
      formattedKey = cleanedKey;
    } else {
      // Default to PKCS#1 format
      formattedKey = `-----BEGIN RSA PRIVATE KEY-----\n${cleanedKey}\n-----END RSA PRIVATE KEY-----`;
    }
    
    debugKey(formattedKey, 'Formatted Private Key');
    return formattedKey;
  } catch (error) {
    console.error('Key formatting error:', error);
    throw new Error('Invalid private key format');
  }
};

// Helper function to attempt decryption with verbose logging
const attemptDecryption = (encryptedKey, privateKey) => {
  console.log('\n=== Starting Decryption Attempts ===');
  
  const decryptionOptions = [
    {
      name: 'PKCS1_OAEP with SHA256',
      options: {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      }
    },
    {
      name: 'PKCS1_OAEP with SHA1',
      options: {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha1'
      }
    },
    {
      name: 'PKCS1 Padding',
      options: {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING
      }
    }
  ];

  for (const { name, options } of decryptionOptions) {
    try {
      console.log(`\nTrying decryption with ${name}`);
      console.log('Options:', JSON.stringify(options, null, 2));
      
      const result = crypto.privateDecrypt(options, encryptedKey);
      console.log('Decryption successful!');
      return result;
    } catch (e) {
      console.log(`Decryption failed with ${name}:`, e.message);
    }
  }
  throw new Error('All decryption attempts failed');
};

module.exports = (db) => {
  const bucket = new GridFSBucket(db, { bucketName: 'uploads' });

  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      const { publicKey } = req.body;
      const file = req.file;

      if (!publicKey || !file) {
        return res.status(400).json({ error: 'Public key and file are required' });
      }

      console.log('\n=== Starting File Upload ===');
      debugKey(publicKey, 'Upload Public Key');

      const fileBuffer = fs.readFileSync(file.path);
      console.log('File size:', fileBuffer.length, 'bytes');

      // Step 1: Generate a random AES key and IV
      const aesKey = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);
      console.log('Generated AES key length:', aesKey.length);
      console.log('Generated IV length:', iv.length);

      // Step 2: Encrypt the file using AES
      const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
      let encryptedFile = cipher.update(fileBuffer);
      encryptedFile = Buffer.concat([encryptedFile, cipher.final()]);
      console.log('Encrypted file size:', encryptedFile.length, 'bytes');

      // Step 3: Encrypt the AES key
      console.log('\nEncrypting AES key with RSA public key...');
      const encryptedKey = crypto.publicEncrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        aesKey
      );
      console.log('Encrypted AES key length:', encryptedKey.length);

      // Step 4: Store in MongoDB
      const uploadStream = bucket.openUploadStream(file.originalname, {
        metadata: {
          encryptedKey: encryptedKey.toString('base64'),
          iv: iv.toString('base64'),
          contentType: file.mimetype,
          encryptionParams: {
            padding: 'RSA_PKCS1_OAEP_PADDING',
            oaepHash: 'sha256',
            keyFormat: publicKey.includes('BEGIN RSA PUBLIC KEY') ? 'PKCS#1' : 'PKCS#8'
          }
        }
      });

      uploadStream.end(encryptedFile, async (err) => {
        if (err) {
          console.error('Upload stream error:', err);
          return res.status(500).json({ error: 'File upload failed' });
        }

        fs.unlinkSync(file.path);
        console.log('File upload completed successfully');
        res.json({ 
          message: 'File uploaded and encrypted successfully',
          encryptionParams: {
            padding: 'RSA_PKCS1_OAEP_PADDING',
            oaepHash: 'sha256'
          }
        });
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'File upload failed' });
    }
  });

  router.post('/download', async (req, res) => {
    try {
      let { fileId, privateKey } = req.body;
  
      console.log('\n=== Starting File Download ===');
      console.log('File ID:', fileId);
  
      if (!fileId || !privateKey) {
        return res.status(400).json({ error: 'File ID and private key are required' });
      }
  
      // Format and validate private key
      try {
        privateKey = formatPrivateKey(privateKey);
      } catch (error) {
        console.error('Private key formatting error:', error);
        return res.status(400).json({ error: 'Invalid private key format' });
      }
  
      // Fetch file and metadata
      const fileDoc = await bucket.find({ _id: new ObjectId(fileId) }).toArray();
      if (fileDoc.length === 0) {
        return res.status(404).json({ error: 'File not found' });
      }
  
      const file = fileDoc[0];
      console.log('File metadata:', JSON.stringify(file.metadata, null, 2));
  
      const encryptedKey = Buffer.from(file.metadata.encryptedKey, 'base64');
      const iv = Buffer.from(file.metadata.iv, 'base64');
  
      console.log('Encrypted key length:', encryptedKey.length);
      console.log('IV length:', iv.length);
  
      // Attempt decryption
      let decryptedKey;
      try {
        decryptedKey = attemptDecryption(encryptedKey, privateKey);
        console.log('AES key decryption successful, length:', decryptedKey.length);
      } catch (error) {
        console.error('Final decryption error:', error);
        return res.status(400).json({ error: 'Failed to decrypt with provided private key' });
      }
  
      // Create buffers to collect chunks for debugging
      let encryptedChunks = [];
      let decryptedChunks = [];
  
      const downloadStream = bucket.openDownloadStream(file._id);
      const decipher = crypto.createDecipheriv('aes-256-cbc', decryptedKey, iv);
  
      // Set proper headers
      res.setHeader('Content-Type', file.metadata.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  
      // Add error handlers for each stream
      downloadStream.on('error', (error) => {
        console.error('Download stream error:', error);
        res.status(500).json({ error: 'Download stream failed' });
      });
  
      decipher.on('error', (error) => {
        console.error('Decipher stream error:', error);
        res.status(500).json({ error: 'Decryption stream failed' });
      });
  
      // Add data handlers for debugging
      downloadStream.on('data', (chunk) => {
        encryptedChunks.push(chunk);
        console.log('Received encrypted chunk:', chunk.length, 'bytes');
      });
  
      decipher.on('data', (chunk) => {
        decryptedChunks.push(chunk);
        console.log('Decrypted chunk:', chunk.length, 'bytes');
      });
  
      // Handle completion
      downloadStream.on('end', () => {
        console.log('Download stream completed. Total encrypted size:', 
          encryptedChunks.reduce((acc, chunk) => acc + chunk.length, 0));
      });
  
      decipher.on('end', () => {
        console.log('Decryption completed. Total decrypted size:', 
          decryptedChunks.reduce((acc, chunk) => acc + chunk.length, 0));
      });
  
      // Pipe the streams together with error handling
      downloadStream
        .pipe(decipher)
        .pipe(res)
        .on('error', (error) => {
          console.error('Streaming pipeline error:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Streaming failed' });
          }
        })
        .on('finish', () => {
          console.log('Download completed successfully');
        });
  
    } catch (error) {
      console.error('Download error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download and decrypt file' });
      }
    }
  });

  router.get('/files', async (req, res) => {
    try {
      const files = await bucket.find({}).toArray();
      const fileList = files.map(file => ({
        id: file._id,
        filename: file.filename,
        uploadDate: file.uploadDate,
        length: file.length,
        encryptionParams: file.metadata.encryptionParams
      }));
      res.json(fileList);
    } catch (error) {
      console.error('Error fetching files:', error);
      res.status(500).json({ error: 'Failed to fetch files' });
    }
  });

  return router;
};