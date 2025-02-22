// Project Structure
/*
user-service/
├── src/
│   ├── config/
│   │   ├── database.js
│   │   └── logger.js
│   ├── controllers/
│   │   └── userController.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── validate.js
│   │   └── rateLimiter.js
│   ├── models/
│   │   └── User.js
│   ├── routes/
│   │   └── userRoutes.js
│   ├── services/
│   │   └── userService.js
│   ├── validations/
│   │   └── userValidation.js
│   └── app.js
├── common/
│   ├── errors/
│   │   ├── index.js
│   │   └── errorHandler.js
│   └── utils/
│       ├── asyncHandler.js
│       └── jwt.js
├── .env
├── package.json
└── Dockerfile
*/

// src/config/database.js
const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;

// src/config/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = logger;

// src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  role: {
    type: String,
    enum: {
      values: ['shipper', 'driver', 'admin'],
      message: 'Role must be either: shipper, driver, or admin'
    },
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  company: {
    type: String,
    trim: true
  },
  verificationToken: String,
  isVerified: {
    type: Boolean,
    default: false
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  lastLogin: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to check if account is locked
userSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

module.exports = mongoose.model('User', userSchema);

// src/validations/userValidation.js
const Joi = require('joi');

const registerValidation = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  phone: Joi.string().required(),
  role: Joi.string().valid('shipper', 'driver', 'admin').required(),
  company: Joi.string().allow('', null)
});

const loginValidation = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const updateValidation = Joi.object({
  name: Joi.string().min(2).max(50),
  phone: Joi.string(),
  company: Joi.string().allow('', null)
});

module.exports = {
  registerValidation,
  loginValidation,
  updateValidation
};

// src/services/userService.js
const User = require('../models/User');
const { AuthenticationError, NotFoundError, ValidationError } = require('../../common/errors');
const jwt = require('../../common/utils/jwt');
const logger = require('../config/logger');

class UserService {
  async register(userData) {
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      throw new ValidationError('Email already registered');
    }

    const user = await User.create(userData);
    const token = jwt.generateToken(user._id);

    return { user, token };
  }

  async login(email, password) {
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }

    if (user.isLocked()) {
      throw new AuthenticationError('Account is locked. Please try again later');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Increment login attempts
      user.loginAttempts += 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = Date.now() + 15 * 60 * 1000; // Lock for 15 minutes
      }
      await user.save();
      throw new AuthenticationError('Invalid credentials');
    }

    // Reset login attempts on successful login
    user.loginAttempts = 0;
    user.lastLogin = Date.now();
    await user.save();

    const token = jwt.generateToken(user._id);
    return { user, token };
  }

  async getProfile(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

  async updateProfile(userId, updateData) {
    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }
}

module.exports = new UserService();

// src/controllers/userController.js
const userService = require('../services/userService');
const asyncHandler = require('../../common/utils/asyncHandler');
const { ValidationError } = require('../../common/errors');
const { registerValidation, loginValidation, updateValidation } = require('../validations/userValidation');

exports.register = asyncHandler(async (req, res) => {
  const { error } = registerValidation.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { user, token } = await userService.register(req.body);
  
  res.status(201).json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    }
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { error } = loginValidation.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { email, password } = req.body;
  const { user, token } = await userService.login(email, password);

  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    }
  });
});

// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');

router.post('/register', rateLimiter, userController.register);
router.post('/login', rateLimiter, userController.login);
router.get('/profile', protect, userController.getProfile);
router.put('/profile', protect, userController.updateProfile);

module.exports = router;

// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { errorHandler } = require('../common/errors');
const connectDB = require('./config/database');
const userRoutes = require('./routes/userRoutes');
require('dotenv').config();

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.use('/api/users', userRoutes);

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`User service running on port ${PORT}`);
});
