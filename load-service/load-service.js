// load-service

/* 
load-service/
├── src/
│   ├── config/
│   │   ├── database.js
│   │   └── logger.js
│   ├── controllers/
│   │   └── loadController.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── validate.js
│   ├── models/
│   │   └── Load.js
│   ├── routes/
│   │   └── loadRoutes.js
│   ├── services/
│   │   └── loadService.js
│   ├── validations/
│   │   └── loadValidation.js
│   └── app.js
├── common/
│   ├── errors/
│   │   └── errorHandler.js
│   └── utils/
│       └── asyncHandler.js
├── .env
├── package.json
└── Dockerfile
*/

// src/models/Load.js
const mongoose = require('mongoose');

const loadSchema = new mongoose.Schema({
  shipperId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['pending', 'assigned', 'in_transit', 'delivered', 'cancelled'],
    default: 'pending'
  },
  pickupLocation: {
    address: String,
    city: String,
    state: String,
    pincode: String,
    coordinates: {
      type: [Number],
      index: '2dsphere'
    }
  },
  deliveryLocation: {
    address: String,
    city: String,
    state: String,
    pincode: String,
    coordinates: {
      type: [Number],
      index: '2dsphere'
    }
  },
  cargoDetails: {
    type: {
      type: String,
      required: true
    },
    weight: Number,
    volume: Number,
    description: String
  },
  pricing: {
    basePrice: {
      type: Number,
      required: true
    },
    commission: {
      type: Number,
      required: true
    },
    totalPrice: {
      type: Number,
      required: true
    }
  },
  schedule: {
    pickupDate: Date,
    deliveryDate: Date,
    flexibleTiming: Boolean
  },
  preferences: {
    truckType: String,
    specialRequirements: [String]
  },
  tracking: {
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        default: [0, 0]
      }
    },
    lastUpdated: Date,
    history: [{
      location: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point'
        },
        coordinates: [Number]
      },
      timestamp: Date,
      status: String
    }]
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
loadSchema.index({ 'pickupLocation.coordinates': '2dsphere' });
loadSchema.index({ 'deliveryLocation.coordinates': '2dsphere' });
loadSchema.index({ status: 1, 'schedule.pickupDate': 1 });

module.exports = mongoose.model('Load', loadSchema);

// src/validations/loadValidation.js
const Joi = require('joi');

const locationSchema = Joi.object({
  address: Joi.string().required(),
  city: Joi.string().required(),
  state: Joi.string().required(),
  pincode: Joi.string().required(),
  coordinates: Joi.array().items(Joi.number()).length(2)
});

const createLoadValidation = Joi.object({
  pickupLocation: locationSchema.required(),
  deliveryLocation: locationSchema.required(),
  cargoDetails: Joi.object({
    type: Joi.string().required(),
    weight: Joi.number(),
    volume: Joi.number(),
    description: Joi.string()
  }).required(),
  pricing: Joi.object({
    basePrice: Joi.number().required(),
    commission: Joi.number().required(),
    totalPrice: Joi.number().required()
  }).required(),
  schedule: Joi.object({
    pickupDate: Joi.date().required(),
    deliveryDate: Joi.date().required(),
    flexibleTiming: Joi.boolean()
  }).required(),
  preferences: Joi.object({
    truckType: Joi.string(),
    specialRequirements: Joi.array().items(Joi.string())
  })
});

const updateLoadValidation = Joi.object({
  status: Joi.string().valid('pending', 'assigned', 'in_transit', 'delivered', 'cancelled'),
  driverId: Joi.string().hex().length(24),
  'tracking.currentLocation': Joi.object({
    coordinates: Joi.array().items(Joi.number()).length(2)
  })
});

module.exports = {
  createLoadValidation,
  updateLoadValidation
};

// src/services/loadService.js
const Load = require('../models/Load');
const { NotFoundError, ValidationError } = require('../../common/errors');
const logger = require('../config/logger');

class LoadService {
  async createLoad(loadData) {
    const load = await Load.create(loadData);
    return load;
  }

  async getLoads(filters = {}, page = 1, limit = 10) {
    const options = {
      page,
      limit,
      sort: { createdAt: -1 },
      populate: {
        path: 'shipperId driverId',
        select: 'name email phone'
      }
    };

    const loads = await Load.paginate(filters, options);
    return loads;
  }

  async getNearbyLoads(coordinates, maxDistance = 100000) {
    const loads = await Load.find({
      status: 'pending',
      'pickupLocation.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: coordinates
          },
          $maxDistance: maxDistance
        }
      }
    }).limit(20);
    
    return loads;
  }

  async assignLoad(loadId, driverId) {
    const load = await Load.findById(loadId);
    if (!load) {
      throw new NotFoundError('Load not found');
    }

    if (load.status !== 'pending') {
      throw new ValidationError('Load is not available for assignment');
    }

    load.driverId = driverId;
    load.status = 'assigned';
    await load.save();

    return load;
  }

  async updateLoadStatus(loadId, status, location) {
    const load = await Load.findById(loadId);
    if (!load) {
      throw new NotFoundError('Load not found');
    }

    load.status = status;
    if (location) {
      load.tracking.currentLocation.coordinates = location.coordinates;
      load.tracking.lastUpdated = new Date();
      load.tracking.history.push({
        location: {
          type: 'Point',
          coordinates: location.coordinates
        },
        timestamp: new Date(),
        status
      });
    }

    await load.save();
    return load;
  }
}

module.exports = new LoadService();

// src/controllers/loadController.js
const loadService = require('../services/loadService');
const asyncHandler = require('../../common/utils/asyncHandler');
const { ValidationError } = require('../../common/errors');
const { createLoadValidation, updateLoadValidation } = require('../validations/loadValidation');

exports.createLoad = asyncHandler(async (req, res) => {
  const { error } = createLoadValidation.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const loadData = {
    ...req.body,
    shipperId: req.user.id
  };

  const load = await loadService.createLoad(loadData);
  
  res.status(201).json({
    success: true,
    data: load
  });
});

exports.getLoads = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  const loads = await loadService.getLoads(filters, parseInt(page), parseInt(limit));
  
  res.json({
    success: true,
    data: loads
  });
});

exports.getNearbyLoads = asyncHandler(async (req, res) => {
  const { longitude, latitude, maxDistance } = req.query;
  
  const loads = await loadService.getNearbyLoads(
    [parseFloat(longitude), parseFloat(latitude)],
    parseFloat(maxDistance)
  );

  res.json({
    success: true,
    data: loads
  });
});

exports.assignLoad = asyncHandler(async (req, res) => {
  const { loadId } = req.params;
  const load = await loadService.assignLoad(loadId, req.user.id);

  res.json({
    success: true,
    data: load
  });
});

exports.updateLoadStatus = asyncHandler(async (req, res) => {
  const { error } = updateLoadValidation.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { loadId } = req.params;
  const { status, location } = req.body;
  
  const load = await loadService.updateLoadStatus(loadId, status, location);

  res.json({
    success: true,
    data: load
  });
});

// src/routes/loadRoutes.js
const express = require('express');
const router = express.Router();
const loadController = require('../controllers/loadController');
const { protect, authorize } = require('../middleware/auth');

router.post('/', protect, authorize(['shipper']), loadController.createLoad);
router.get('/', protect, loadController.getLoads);
router.get('/nearby', protect, authorize(['driver']), loadController.getNearbyLoads);
router.put('/:loadId/assign', protect, authorize(['driver']), loadController.assignLoad);
router.put('/:loadId/status', protect, authorize(['driver']), loadController.updateLoadStatus);

module.exports = router;