const axios = require('axios');

const PKI_BASE_URL = 'http://localhost:4000';

module.exports = {
    issueCertificate: async (subject) => {
      try {
        const response = await axios.post(`${PKI_BASE_URL}/issue`, { subject });
        console.log('Certificate response:', response.data);  
        return response.data;
      } catch (error) {
        console.error('Error issuing certificate:', error);
        throw new Error('PKI certificate issuance failed');
      }
    },
  
  

  getPublicKey: async (certificateId) => {
    try {
      const response = await axios.get(`${PKI_BASE_URL}/public-key/${certificateId}`);
      return response.data.publicKey;
    } catch (error) {
      console.error('Error fetching public key:', error);
      throw new Error('PKI public key retrieval failed');
    }
  }
};
