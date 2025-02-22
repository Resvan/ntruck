// Add to src/config/metrics.js
const prometheus = require('prom-client');
const register = new prometheus.Registry();

// Add default metrics
prometheus.collectDefaultMetrics({ register });

// Custom metrics
const tripCounter = new prometheus.Counter({
  name: 'driver_trips_total',
  help: 'Total number of trips completed',
  labelNames: ['status']
});

const activeDriversGauge = new prometheus.Gauge({
  name: 'active_drivers_total',
  help: 'Number of currently active drivers'
});

const tripDurationHistogram = new prometheus.Histogram({
  name: 'trip_duration_minutes',
  help: 'Trip duration in minutes',
  buckets: [15, 30, 60, 120, 180, 240, 300, 360, 420, 480]
});

const driverEarningsGauge = new prometheus.Gauge({
  name: 'driver_earnings_total',
  help: 'Total earnings of drivers',
  labelNames: ['driver_id']
});

register.registerMetric(tripCounter);
register.registerMetric(activeDriversGauge);
register.registerMetric(tripDurationHistogram);
register.registerMetric(driverEarningsGauge);

module.exports = {
  register,
  metrics: {
    tripCounter,
    activeDriversGauge,
    tripDurationHistogram,
    driverEarningsGauge
  }
};

// Add metrics endpoint to app.js
const metrics = require('./config/metrics');

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

// Update driverService.js to include metrics
const metrics = require('../config/metrics');

class DriverService {
  async startTrip(driverId, loadId, startLocation) {
    const trip = await super.startTrip(driverId, loadId, startLocation);
    metrics.tripCounter.inc({ status: 'started' });
    return trip;
  }

  async endTrip(tripId, endLocation, distance, earnings) {
    const trip = await super.endTrip(tripId, endLocation, distance, earnings);
    
    metrics.tripCounter.inc({ status: 'completed' });
    metrics.tripDurationHistogram.observe(
      (trip.endTime - trip.startTime) / (1000 * 60)
    );
    metrics.driverEarningsGauge.set(
      { driver_id: trip.driverId.toString() },
      earnings.totalAmount
    );
    
    return trip;
  }

  async updateLocation(driverId, coordinates, status) {
    const driver = await super.updateLocation(driverId, coordinates, status);
    
    if (status === 'available') {
      metrics.activeDriversGauge.inc();
    } else if (status === 'offline') {
      metrics.activeDriversGauge.dec();
    }
    
    return driver;
  }
}