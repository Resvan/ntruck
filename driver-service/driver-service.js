// src/models/Driver.js
const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  licenseNumber: {
    type: String,
    required: true,
    unique: true
  },
  licenseExpiry: {
    type: Date,
    required: true
  },
  experience: {
    type: Number,
    required: true
  },
  preferredRoutes: [{
    from: String,
    to: String
  }],
  vehicleDetails: {
    type: {
      type: String,
      required: true
    },
    registrationNumber: {
      type: String,
      required: true,
      unique: true
    },
    capacity: Number,
    make: String,
    model: String,
    year: Number
  },
  documents: {
    license: {
      url: String,
      verified: {
        type: Boolean,
        default: false
      }
    },
    insurance: {
      url: String,
      expiry: Date,
      verified: {
        type: Boolean,
        default: false
      }
    },
    permitDetails: {
      number: String,
      expiry: Date,
      verified: {
        type: Boolean,
        default: false
      }
    }
  },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    },
    lastUpdated: Date
  },
  status: {
    type: String,
    enum: ['available', 'on_trip', 'offline', 'maintenance'],
    default: 'offline'
  },
  ratings: {
    average: {
      type: Number,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },
  earnings: {
    total: {
      type: Number,
      default: 0
    },
    pendingPayouts: {
      type: Number,
      default: 0
    },
    lastPayout: {
      amount: Number,
      date: Date
    }
  },
  activeLoad: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Load'
  }
}, {
  timestamps: true
});

// Index for geospatial queries
driverSchema.index({ currentLocation: '2dsphere' });

module.exports = mongoose.model('Driver', driverSchema);

// src/models/DriverTrip.js
const mongoose = require('mongoose');

const driverTripSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true
  },
  loadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Load',
    required: true
  },
  status: {
    type: String,
    enum: ['started', 'completed', 'cancelled'],
    default: 'started'
  },
  startLocation: {
    coordinates: [Number],
    address: String
  },
  endLocation: {
    coordinates: [Number],
    address: String
  },
  startTime: Date,
  endTime: Date,
  distance: Number,
  earnings: {
    baseAmount: Number,
    bonusAmount: Number,
    totalAmount: Number
  },
  rating: {
    score: Number,
    feedback: String
  },
  route: [{
    coordinates: [Number],
    timestamp: Date,
    status: String
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('DriverTrip', driverTripSchema);

// src/validations/driverValidation.js
const Joi = require('joi');

const vehicleDetailsSchema = Joi.object({
  type: Joi.string().required(),
  registrationNumber: Joi.string().required(),
  capacity: Joi.number(),
  make: Joi.string().required(),
  model: Joi.string().required(),
  year: Joi.number().required()
});

const createDriverValidation = Joi.object({
  licenseNumber: Joi.string().required(),
  licenseExpiry: Joi.date().required(),
  experience: Joi.number().required(),
  preferredRoutes: Joi.array().items(
    Joi.object({
      from: Joi.string().required(),
      to: Joi.string().required()
    })
  ),
  vehicleDetails: vehicleDetailsSchema.required(),
  documents: Joi.object({
    license: Joi.object({
      url: Joi.string().required()
    }),
    insurance: Joi.object({
      url: Joi.string().required(),
      expiry: Joi.date().required()
    }),
    permitDetails: Joi.object({
      number: Joi.string().required(),
      expiry: Joi.date().required()
    })
  }).required()
});

const updateLocationValidation = Joi.object({
  coordinates: Joi.array().items(Joi.number()).length(2).required(),
  status: Joi.string().valid('available', 'on_trip', 'offline', 'maintenance')
});

const updateDriverValidation = Joi.object({
  experience: Joi.number(),
  preferredRoutes: Joi.array().items(
    Joi.object({
      from: Joi.string().required(),
      to: Joi.string().required()
    })
  ),
  vehicleDetails: vehicleDetailsSchema,
  status: Joi.string().valid('available', 'on_trip', 'offline', 'maintenance')
});

module.exports = {
  createDriverValidation,
  updateLocationValidation,
  updateDriverValidation
};

// src/services/driverService.js
const Driver = require('../models/Driver');
const DriverTrip = require('../models/DriverTrip');
const { NotFoundError, ValidationError } = require('../../common/errors');
const kafkaClient = require('../../common/kafka/kafkaClient');
const logger = require('../config/logger');

class DriverService {
  async createDriver(userId, driverData) {
    const existingDriver = await Driver.findOne({ userId });
    if (existingDriver) {
      throw new ValidationError('Driver profile already exists');
    }

    const driver = await Driver.create({
      userId,
      ...driverData
    });

    // Publish driver created event
    await kafkaClient.publish('driver-events', {
      type: 'DRIVER_CREATED',
      data: {
        driverId: driver._id,
        userId: driver.userId,
        vehicleType: driver.vehicleDetails.type
      }
    });

    return driver;
  }

  async getDriver(driverId) {
    const driver = await Driver.findById(driverId)
      .populate('userId', 'name email phone')
      .populate('activeLoad');
    
    if (!driver) {
      throw new NotFoundError('Driver not found');
    }
    return driver;
  }

  async updateLocation(driverId, coordinates, status) {
    const driver = await Driver.findById(driverId);
    if (!driver) {
      throw new NotFoundError('Driver not found');
    }

    driver.currentLocation.coordinates = coordinates;
    driver.currentLocation.lastUpdated = new Date();
    if (status) {
      driver.status = status;
    }

    await driver.save();

    // Publish location update event
    if (driver.activeLoad) {
      await kafkaClient.publish('driver-events', {
        type: 'DRIVER_LOCATION_UPDATED',
        data: {
          driverId: driver._id,
          loadId: driver.activeLoad,
          coordinates,
          status: driver.status
        }
      });
    }

    return driver;
  }

  async getNearbyDrivers(coordinates, maxDistance = 50000) {
    const drivers = await Driver.find({
      status: 'available',
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: coordinates
          },
          $maxDistance: maxDistance
        }
      }
    })
    .populate('userId', 'name phone')
    .limit(20);

    return drivers;
  }

  async startTrip(driverId, loadId, startLocation) {
    const driver = await Driver.findById(driverId);
    if (!driver) {
      throw new NotFoundError('Driver not found');
    }

    if (driver.status === 'on_trip') {
      throw new ValidationError('Driver is already on a trip');
    }

    const trip = await DriverTrip.create({
      driverId,
      loadId,
      startLocation,
      startTime: new Date()
    });

    driver.status = 'on_trip';
    driver.activeLoad = loadId;
    await driver.save();

    // Publish trip started event
    await kafkaClient.publish('driver-events', {
      type: 'TRIP_STARTED',
      data: {
        tripId: trip._id,
        driverId,
        loadId,
        startLocation
      }
    });

    return trip;
  }

  async endTrip(tripId, endLocation, distance, earnings) {
    const trip = await DriverTrip.findById(tripId);
    if (!trip) {
      throw new NotFoundError('Trip not found');
    }

    const driver = await Driver.findById(trip.driverId);
    if (!driver) {
      throw new NotFoundError('Driver not found');
    }

    trip.status = 'completed';
    trip.endLocation = endLocation;
    trip.endTime = new Date();
    trip.distance = distance;
    trip.earnings = earnings;
    await trip.save();

    driver.status = 'available';
    driver.activeLoad = null;
    driver.earnings.total += earnings.totalAmount;
    driver.earnings.pendingPayouts += earnings.totalAmount;
    await driver.save();

    // Publish trip completed event
    await kafkaClient.publish('driver-events', {
      type: 'TRIP_COMPLETED',
      data: {
        tripId: trip._id,
        driverId: driver._id,
        loadId: trip.loadId,
        earnings
      }
    });

    return trip;
  }

  async getTripHistory(driverId, page = 1, limit = 10) {
    const trips = await DriverTrip.find({ driverId })
      .populate('loadId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await DriverTrip.countDocuments({ driverId });

    return {
      trips,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    };
  }
}

module.exports = new DriverService();

// src/controllers/driverController.js
const driverService = require('../services/driverService');
const asyncHandler = require('../../common/utils/asyncHandler');
const { ValidationError } = require('../../common/errors');
const { 
  createDriverValidation, 
  updateLocationValidation, 
  updateDriverValidation 
} = require('../validations/driverValidation');

exports.createDriver = asyncHandler(async (req, res) => {
  const { error } = createDriverValidation.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const driver = await driverService.createDriver(req.user.id, req.body);
  
  res.status(201).json({
    success: true,
    data: driver
  });
});

exports.getProfile = asyncHandler(async (req, res) => {
  const driver = await driverService.getDriver(req.params.driverId);
  
  res.json({
    success: true,
    data: driver
  });
});

exports.updateLocation = asyncHandler(async (req, res) => {
  const { error } = updateLocationValidation.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { coordinates, status } = req.body;
  const driver = await driverService.updateLocation(req.params.driverId, coordinates, status);

  res.json({
    success: true,
    data: driver
  });
});

exports.getNearbyDrivers = asyncHandler(async (req, res) => {
  const { longitude, latitude, maxDistance } = req.query;
  
  const drivers = await driverService.getNearbyDrivers(
    [parseFloat(longitude), parseFloat(latitude)],
    parseFloat(maxDistance)
  );

  res.json({
    success: true,
    data: drivers
  });
});

exports.startTrip = asyncHandler(async (req, res) => {
  const { loadId, startLocation } = req.body;
  const trip = await driverService.startTrip(req.params.driverId, loadId, startLocation);

  res.json({
    success: true,
    data: trip
  });
});

exports.endTrip = asyncHandler(async (req, res) => {
  const { tripId, endLocation, distance, earnings } = req.body;
  const trip = await driverService.endTrip(tripId, endLocation, distance, earnings);

  res.json({
    success: true,
    data: trip
  });
});

exports.getTripHistory = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const history = await driverService.getTripHistory(
    req.params.driverId,
    parseInt(page),
    parseInt(limit)
  );

  res.json({
    success: true,
    data: history
  });
});

// src/routes/driverRoutes.js
const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driverController');
const { protect, authorize } = require('../middleware/auth');

router.post('/', protect, authorize(['driver']), driverController.createDriver);
router.get('/:driverId', protect, driverController.getProfile);
router.put('/:driverId/location', protect, authorize(['driver']), driverController.updateLocation);
router.get('/nearby', protect, driverController.getNearbyDrivers);
router.post('/:driverId/trips/start', protect, authorize(['driver']), driverController.startTrip);
router.put('/trips/:tripId/end', protect, authorize(['driver']), driverController.endTrip);
router.get('/:driverId/trips', protect, driverController.getTripHistory);

module.exports = router;