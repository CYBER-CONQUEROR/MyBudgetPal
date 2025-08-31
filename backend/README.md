# MyBudgetPal Backend API

A comprehensive budget management API built with Node.js, Express, and MongoDB.

## Features

- **Event Management**: Create, read, update, and delete events with budgets
- **Expense Tracking**: Track daily expenses with categories and payment methods
- **Statistics**: Get detailed expense analytics and summaries
- **RESTful API**: Clean, consistent API endpoints
- **Data Validation**: Comprehensive input validation and error handling

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local installation or MongoDB Atlas)
- npm or yarn

## Installation

1. **Clone the repository and navigate to backend:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   - Copy `config/config.env` and modify as needed
   - Update `MONGO_URI` to point to your MongoDB instance
   - Set a secure `JWT_SECRET` for authentication (if needed)

4. **Start MongoDB:**
   - Local: Make sure MongoDB is running on `mongodb://localhost:27017`
   - Atlas: Use your MongoDB Atlas connection string

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:5000`

## API Endpoints

### Health Check
- `GET /` - Check if API is running

### Events
- `GET /api/events` - Get all events
- `GET /api/events/:id` - Get event by ID
- `POST /api/events` - Create new event
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event

### Expenses
- `GET /api/expenses` - Get all expenses (with optional filters)
- `GET /api/expenses/stats` - Get expense statistics
- `GET /api/expenses/:id` - Get expense by ID
- `POST /api/expenses` - Create new expense
- `PUT /api/expenses/:id` - Update expense
- `DELETE /api/expenses/:id` - Delete expense

## Testing with Postman

1. **Import the collection:**
   - Open Postman
   - Import `MyBudgetPal_API.postman_collection.json`
   - The collection includes all API endpoints with example data

2. **Set up environment:**
   - The collection uses a `baseUrl` variable set to `http://localhost:5000`
   - Update this if your server runs on a different port

3. **Test the API:**
   - Start with the "Health Check" request
   - Create some events and expenses
   - Test filtering and statistics endpoints

## Example API Usage

### Create an Event
```bash
curl -X POST http://localhost:5000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Birthday Party",
    "date": "2024-12-25",
    "budget": 500,
    "description": "My birthday celebration"
  }'
```

### Create an Expense
```bash
curl -X POST http://localhost:5000/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Lunch at Restaurant",
    "amount": 25.50,
    "category": "Food",
    "description": "Business lunch"
  }'
```

### Get Filtered Expenses
```bash
curl "http://localhost:5000/api/expenses?category=Food&startDate=2024-01-01&endDate=2024-12-31"
```

## Data Models

### Event Schema
```javascript
{
  name: String (required),
  date: String (required),
  budget: Number (required, min: 0),
  expenses: Number (default: 0, min: 0),
  description: String (max: 500 chars),
  createdAt: Date,
  updatedAt: Date
}
```

### Expense Schema
```javascript
{
  title: String (required),
  amount: Number (required, min: 0.01),
  category: String (enum: Food, Transportation, Entertainment, etc.),
  date: Date (default: now),
  description: String (max: 500 chars),
  paymentMethod: String (enum: Cash, Credit Card, etc.),
  isRecurring: Boolean (default: false),
  recurringFrequency: String (if recurring),
  createdAt: Date,
  updatedAt: Date
}
```

## Error Handling

The API returns consistent error responses:
```json
{
  "success": false,
  "error": "Error message"
}
```

## Success Responses

All successful operations return:
```json
{
  "success": true,
  "data": {...} // or "message": "..." for deletions
}
```

## Development

### Project Structure
```
backend/
├── config/
│   ├── db.js              # Database connection
│   └── config.env         # Environment variables
├── eventExpenses/
│   ├── eventController/   # Event controllers
│   ├── eventModel/        # Event models
│   └── eventRoutes/       # Event routes
├── dayToDayExpenses/
│   ├── controllers/       # Expense controllers
│   ├── models/           # Expense models
│   └── routes/           # Expense routes
├── server.js             # Main server file
├── package.json          # Dependencies
└── README.md            # This file
```

### Adding New Features

1. Create models in the appropriate directory
2. Create controllers with business logic
3. Create routes to expose endpoints
4. Add routes to `server.js`
5. Test with Postman

## Troubleshooting

### Common Issues

1. **MongoDB Connection Error:**
   - Ensure MongoDB is running
   - Check connection string in `config.env`
   - Verify network connectivity

2. **Port Already in Use:**
   - Change PORT in `config.env`
   - Kill existing processes on port 5000

3. **Validation Errors:**
   - Check required fields in request body
   - Verify data types and constraints

### Logs

The server logs connection status and errors to the console. Check for:
- MongoDB connection success/failure
- Server startup messages
- Request errors

## Contributing

1. Follow the existing code structure
2. Add proper error handling
3. Include input validation
4. Test with Postman before committing
5. Update documentation as needed





