// Import routes
const dataRoutes = require('./routes/dataRoutes');
const cloudRoutes = require('./routes/cloudRoutes');

// Routes
app.use('/api/data', dataRoutes);
app.use('/api/cloud', cloudRoutes); 