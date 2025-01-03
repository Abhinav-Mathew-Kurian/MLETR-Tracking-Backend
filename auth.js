const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key'; 

class Auth {
  static generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
  }

  static async authenticateToken(req, res, next) {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  }
}

module.exports = Auth;