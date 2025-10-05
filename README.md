# Smart Stocktake Application

A full-stack warehouse stocktake application with camera input, AI-powered product data extraction, offline capability, and role-based access control.

## Features

### Core Functionality
- **Camera Integration**: Take photos of products directly from mobile devices or upload existing images
- **AI Product Extraction**: Uses Google Cloud Vision API to extract:
  - Product name
  - Barcode/SKU
  - Lot number
  - Pack size
- **Manual Data Entry**: Stocktakers can enter:
  - Actual quantity and unit type (pallet, case, layer)
  - Branch/warehouse location
  - Specific location code (e.g., A-01, B-12)
  - Expiry date for FEFO tracking
- **Bulk Upload**: CSV import for mass product data updates (Manager/Admin only)
  - Product number, description, lot, expiry date
  - Branch, location, stock levels
  - Stock on hand, allocated, and available quantities
- **Offline Support**: Queue entries locally when offline, sync when connection restored
- **Variance Reporting**: Automatic calculation of differences between expected and actual stock
- **Role-Based Access**: Three distinct user roles with appropriate permissions

### User Roles

#### Stocktaker (Default)
- Take product photos and create stocktake entries
- View their own entries
- Access sync queue to upload pending entries
- Cannot access reports or user management

#### Manager
- All stocktaker permissions
- View all stocktake entries from all users
- Access variance reports
- Review and mark variances as reviewed/resolved
- Bulk upload products via CSV
- Cannot manage users

#### Admin
- All manager permissions
- Full user management capabilities
- Edit user roles
- Delete users
- View all system data

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and builds
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Supabase Client** for database and auth

### Backend
- **Supabase** (PostgreSQL database)
- **Row Level Security (RLS)** for data access control
- **Supabase Storage** for image uploads
- **Supabase Edge Functions** for AI integration

### AI Integration
- **Google Cloud Vision API** via Supabase Edge Function
- Text detection and OCR
- Smart parsing of product information

## Database Schema

### Tables

#### `user_profiles`
- Extends auth.users with role and profile information
- Roles: stocktaker, manager, admin
- Automatically created on user signup

#### `products`
- Master product catalog
- Stores expected inventory quantities and current stock levels
- Tracks by branch, location, lot, and expiry date
- Fields: product_name, barcode, pack_size, expected_quantity, unit_type, branch, location, lot, expiry_date, stock_on_hand, allocated_stock, available_stock
- Available stock is auto-calculated: stock_on_hand - allocated_stock
- Linked to stocktake entries via barcode

#### `stocktake_entries`
- Individual stocktake records
- Links to user who created entry
- Stores AI-extracted data and manual quantity input
- Includes branch, location, and expiry date context
- Tracks sync status for offline capability

#### `bulk_uploads`
- Tracks bulk CSV upload operations
- Records total, success, and failed counts
- Stores detailed error logs for failed rows
- Status: processing, completed, failed

#### `variance_reports`
- Automatically generated when entries are synced
- Calculates difference between expected and actual
- Tracks review status and notes
- Manager/Admin can review and resolve

## Getting Started

### Prerequisites
- Node.js 18+ installed
- Supabase account (already configured)
- Google Cloud Vision API key (optional, falls back to mock data)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Environment variables are already configured in `.env`

3. Start the development server:
```bash
npm run dev
```

The application will automatically open in your browser.

### Building for Production

```bash
npm run build
```

## Usage Guide

### First Time Setup

1. **Register a New Account**
   - Click "Register" on the login screen
   - Enter your full name, email, and password
   - New users are assigned "stocktaker" role by default

2. **Admin Setup**
   - The first user should be manually promoted to admin via database
   - Or use the SQL query:
     ```sql
     UPDATE user_profiles SET role = 'admin' WHERE id = 'user-id-here';
     ```

### Creating Stocktake Entries

1. Click "Stocktake" in the navigation
2. Choose "Take Photo" (mobile camera) or "Upload Photo"
3. Select/capture product image
4. Click "Extract Product Info" to use AI extraction
5. Review and edit extracted data as needed
6. Enter required information:
   - Branch/warehouse (e.g., "Main Warehouse")
   - Location code (e.g., "A-01")
   - Expiry date (optional, for lot tracking)
   - Actual quantity counted
   - Unit type (pallet, case, or layer)
7. Click "Save Entry"

### Bulk Uploading Products (Manager/Admin)

1. Click "Bulk Upload" in the navigation
2. Download the CSV template
3. Fill in product data with columns:
   - Product Number (barcode)
   - Product Description
   - Lot
   - Expiry Date (YYYY-MM-DD format)
   - Branch
   - Location
   - Stock on Hand
   - Allocated Stock
   - Available Stock
4. Upload the completed CSV file
5. Review import results (success/failed counts)
6. Check error log for any failed rows

### Managing Sync Queue

1. Click "Sync Queue" in the navigation
2. View all pending offline entries
3. Click "Sync All" to upload all entries
4. Or sync individual entries one at a time
5. Clear queue if needed (with confirmation)

### Viewing Variance Reports (Manager/Admin)

1. Click "Variance" in the navigation
2. Filter by status: All, Pending, Reviewed, Resolved
3. View variance percentages and amounts
4. Click "Review" to add notes and update status
5. Mark as "Reviewed" or "Resolved"

### Managing Users (Admin Only)

1. Click "Users" in the navigation
2. View all registered users
3. Click edit icon to change user roles
4. Select new role and confirm
5. Delete users if necessary (with confirmation)

## API Integration

### Google Cloud Vision API

To enable real AI extraction (currently using mock data):

1. Get a Google Cloud Vision API key from Google Cloud Console
2. The API key is automatically configured as a secret in Supabase Edge Functions
3. No manual configuration needed - the system handles it automatically

The Edge Function endpoint:
```
POST /functions/v1/extract-product-info
Headers: Authorization: Bearer <anon-key>
Body: { "image_base64": "data:image/jpeg;base64,..." }
```

### Supabase Storage

Images are stored in the `stocktake-images` bucket with:
- Public read access for viewing
- Authenticated write access for uploads
- Automatic URL generation for database storage

## Security Features

### Row Level Security (RLS)
All tables have comprehensive RLS policies:
- Users can only view their own data by default
- Managers can view all operational data
- Admins have full access
- All policies require authentication

### Data Validation
- Input validation on forms
- Type checking with TypeScript
- Database constraints and foreign keys
- Secure file upload handling

### Authentication
- Email/password authentication via Supabase
- Secure session management
- Automatic token refresh
- Protected routes based on role

## Offline Capability

The sync queue system provides offline support:
- Entries saved to localStorage when created
- Automatically queued if offline
- Manual or automatic sync when online
- Progress tracking during sync
- Error handling with retry capability

## Sample Data

The database is pre-populated with sample products:
- Premium Coffee Beans (1234567890123)
- Organic Tea Leaves (9876543210987)
- Chocolate Bar Variety Pack (5555555555555)
- Mineral Water Bottles (7777777777777)
- Pasta Variety Pack (3333333333333)

## Design System

### Color Scheme

The application uses a professional, warehouse-appropriate color palette designed for clarity and usability in industrial environments:

#### Primary Colors
- **Blue (#2563EB / blue-600)**: Primary actions, navigation, main CTA buttons
- **Dark Blue (#1E40AF / blue-700)**: Hover states for primary elements
- **Light Blue (#DBEAFE / blue-50)**: Backgrounds for informational elements

#### Status Colors
- **Green (#16A34A / green-600)**: Success states, positive variance, confirmation actions
- **Yellow (#CA8A04 / yellow-600)**: Warning states, moderate variance, pending items
- **Red (#DC2626 / red-600)**: Error states, negative variance, destructive actions

#### Neutral Colors
- **Slate (#0F172A / slate-900)**: Login/register page backgrounds (gradient)
- **Gray (#1F2937 / gray-800)**: Primary text, headings
- **Light Gray (#F9FAFB / gray-50)**: Page backgrounds
- **White (#FFFFFF)**: Card backgrounds, form inputs

#### Role-Specific Colors
- **Admin Badge**: Red background (#FEE2E2 / red-100), Red text (#991B1B / red-800)
- **Manager Badge**: Blue background (#DBEAFE / blue-100), Blue text (#1E40AF / blue-800)
- **Stocktaker Badge**: Gray background (#F3F4F6 / gray-100), Gray text (#1F2937 / gray-800)

#### Variance Indicators
- **Low Variance (<5%)**: Green (#16A34A / green-600) - Acceptable range
- **Medium Variance (5-15%)**: Yellow (#CA8A04 / yellow-600) - Requires attention
- **High Variance (>15%)**: Red (#DC2626 / red-600) - Critical issue

### Typography
- **Font Family**: System font stack (sans-serif)
- **Headings**: Font weight 700 (bold), sizes 2xl-3xl
- **Body Text**: Font weight 400 (normal), size base
- **Small Text**: Font weight 400 (normal), size sm/xs
- **Buttons**: Font weight 500 (medium), size base

### Spacing & Layout
- **Base Unit**: 4px (Tailwind's spacing scale)
- **Card Padding**: 24px (p-6)
- **Section Gaps**: 24px (gap-6)
- **Button Padding**: 12px vertical, 16px horizontal (py-3 px-4)
- **Border Radius**: 8px (rounded-lg) for cards, 6px (rounded-md) for inputs

### Components

#### Buttons
- **Primary**: Blue background, white text, hover darkens
- **Secondary**: Gray background, dark text, hover darkens
- **Destructive**: Red background, white text, hover darkens
- **Disabled**: 50% opacity, no pointer events

#### Forms
- **Input Fields**: Gray border, blue focus ring, rounded corners
- **Labels**: Medium font weight, gray-700 color
- **Validation**: Red border and text for errors, green for success

#### Cards
- **Background**: White with subtle shadow
- **Border Radius**: 12px (rounded-xl)
- **Shadow**: lg shadow for depth

#### Navigation
- **Active State**: Blue background, white text
- **Inactive State**: Gray text, hover background
- **Mobile Menu**: Full-width dropdown with smooth transitions

### Responsive Breakpoints
- **Mobile**: < 768px (single column layout)
- **Tablet**: 768px - 1024px (responsive grid)
- **Desktop**: > 1024px (full multi-column layout)

### Accessibility
- **Color Contrast**: WCAG AA compliant (4.5:1 minimum)
- **Focus States**: Visible ring on all interactive elements
- **Touch Targets**: Minimum 44x44px for mobile
- **Screen Reader**: Semantic HTML with ARIA labels where needed

## Development

### Project Structure
```
src/
├── components/         # React components
│   ├── Dashboard.tsx   # Main app layout with navigation
│   ├── Login.tsx       # Login form
│   ├── Register.tsx    # Registration form
│   ├── StocktakeEntry.tsx  # Photo capture and entry form
│   ├── BulkUpload.tsx  # CSV bulk upload for products
│   ├── SyncQueue.tsx   # Offline sync management
│   ├── VarianceReports.tsx  # Variance viewing and review
│   ├── UserManagement.tsx   # User role management
│   └── ProtectedRoute.tsx   # Role-based route protection
├── contexts/
│   └── AuthContext.tsx # Authentication state management
├── lib/
│   ├── supabase.ts     # Supabase client and types
│   └── syncQueue.ts    # Offline queue management
└── App.tsx            # Root component

supabase/
├── migrations/
│   ├── create_stocktake_schema.sql  # Initial database schema
│   └── add_inventory_fields_and_bulk_upload.sql  # Inventory tracking fields
└── functions/
    └── extract-product-info/  # Google Vision API integration
        └── index.ts
```

### Running Tests
```bash
npm run lint
npm run typecheck
```

## Troubleshooting

### Images Not Uploading
- Check storage bucket permissions
- Verify authentication token is valid
- Check browser console for errors

### AI Extraction Not Working
- Verify Google Cloud Vision API key is configured
- Check Edge Function logs in Supabase dashboard
- Falls back to mock data if API key not configured

### Variance Reports Not Generating
- Ensure product exists with matching barcode
- Check stocktake entry has synced = true
- Verify trigger function is enabled

### Permission Denied Errors
- Check user role in user_profiles table
- Verify RLS policies are enabled
- Ensure user is authenticated

## License

MIT

## Support

For issues or questions, please check:
1. Browser console for error messages
2. Supabase dashboard logs
3. Database RLS policies
4. Network tab for API calls
