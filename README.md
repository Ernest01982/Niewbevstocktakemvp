# Neiw Bev Stocktake MVP

This document provides instructions for setting up, running, and testing the Neiw Bev Stocktake MVP application.

## Environment Variables

Create a `.env` file in the `frontend` directory with the following content:

```
VITE_SUPABASE_URL=https://osekmgnqymeadecziuwv.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zZWttZ25xeW1lYWRlY3ppdXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2Nzc3ODUsImV4cCI6MjA3NTI1Mzc4NX0.xJOXMPvA_lNWHJUFQkd1VtjABp_YTYpvu-3_nFsQoLA
```

## Running the Application

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Run the development server:**
    ```bash
    npm run dev
    ```

## Testing

Please refer to the `TESTING_PLAN.md` file for detailed instructions on how to manually test the application, especially the Row Level Security policies.

## Viewing Logs

You can view the logs for your Edge Functions in the Supabase dashboard:

1.  Go to your Supabase project dashboard.
2.  In the left sidebar, click on the **Edge Functions** icon.
3.  Select the function you want to inspect.
4.  The logs will be displayed in the **Logs** tab.

## Manual Testing (curl examples)

You can use `curl` to manually test the Edge Functions.

### submit-count

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_ANON_KEY>" \
  -d 
  {
    "event_id": "<your_event_id>",
    "warehouse_code": "<your_warehouse_code>",
    "stock_code": "<your_stock_code>",
    "singles_units": 10
  }
  \
  https://osekmgnqymeadecziuwv.supabase.co/functions/v1/submit-count
```

### assign-recounts

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_ANON_KEY>" \
  -d 
  {
    "event_id": "<your_event_id>",
    "warehouse_code": "<your_warehouse_code>",
    "items": [
      { "stock_code": "<your_stock_code>", "lot_number": "<your_lot_number>" }
    ]
  }
  \
  https://osekmgnqymeadecziuwv.supabase.co/functions/v1/assign-recounts
```

### export-counts

```bash
curl -X GET \
  -H "Authorization: Bearer <YOUR_ANON_KEY>" \
  "https://osekmgnqymeadecziuwv.supabase.co/functions/v1/export-counts?event_id=<your_event_id>&warehouse_code=<your_warehouse_code>"
```