# POS Desktop

A modern Point of Sale (POS) desktop application built with React, TypeScript, Electron, Tailwind CSS, and shadcn/ui components.

## Features

- 🛒 **Modern POS Interface** - Clean, intuitive design optimized for sales transactions
- 📦 **Product Catalog** - Grid and list views with category filtering and search
- 🛍️ **Smart Cart** - Add, remove, modify quantities with real-time calculations
- 💳 **Multiple Payment Methods** - Cash, card, digital wallet, check, and gift card support
- 🧾 **Transaction History** - Complete sales tracking with detailed reporting
- 📊 **Daily Summary** - Sales metrics and performance tracking
- ⚡ **Real-time Updates** - Live cart totals, tax calculations, and change computation
- 🎨 **Beautiful UI** - Modern design with shadcn/ui components and Tailwind CSS

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Desktop**: Electron 27
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: Zustand
- **Build Tool**: Vite
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd pos-desktop
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run electron:dev
```

This will start both the Vite dev server and Electron application.

## Available Scripts

- `npm run dev` - Start Vite development server
- `npm run electron:dev` - Start both Vite and Electron in development mode
- `npm run build` - Build for production
- `npm run electron:build` - Build Electron app for current platform
- `npm run dist:win` - Build Windows installer
- `npm run preview` - Preview production build

## Building for Windows

### Method 1: Using npm script
```bash
npm run dist:win
```

### Method 2: Using batch script (Windows only)
```bash
scripts/build-windows.bat
```

### Method 3: Using Node.js build script
```bash
node build-win.js
```

The Windows installer will be created in the `release/` directory.

## Project Structure

```
src/
├── components/          # React components
│   ├── layout/         # Layout components (Sidebar, Header, etc.)
│   ├── pos/            # POS-specific components
│   ├── transactions/   # Transaction management
│   └── ui/             # shadcn/ui components
├── data/               # Mock data and fixtures
├── lib/                # Utility functions
├── stores/             # Zustand state stores
├── types/              # TypeScript type definitions
└── globals.css         # Global styles and CSS variables

electron/
├── main.ts             # Electron main process
└── preload.ts          # Preload script for IPC

scripts/
└── build-windows.bat   # Windows build script
```

## Features Overview

### Point of Sale Interface
- Product grid/list view toggle
- Category-based filtering
- Real-time search functionality
- Quick add-to-cart actions

### Shopping Cart
- Item quantity management
- Price calculations with tax
- Discount support (percentage/fixed)
- Real-time total updates

### Checkout Process
- Multiple payment method support
- Cash payment with change calculation
- Transaction completion flow
- Receipt generation ready

### Transaction Management
- Complete transaction history
- Daily sales summaries
- Payment method tracking
- Transaction search and filtering

## Mock Data

The application comes with comprehensive mock data including:
- 15+ sample products across 5 categories
- Multiple payment methods
- Sample user/cashier data
- Transaction templates

## Customization

### Adding New Products
Edit `src/data/mockData.ts` to add new products, categories, or payment methods.

### Styling
The app uses Tailwind CSS with a custom design system. Modify `src/globals.css` for theme changes.

### State Management
Zustand stores are located in `src/stores/`. Each store handles specific domain logic:
- `useCartStore` - Shopping cart operations
- `useProductStore` - Product catalog and filtering
- `useTransactionStore` - Transaction history and processing

## Development

### Adding New Components
1. Create component in appropriate directory under `src/components/`
2. Export from index file if needed
3. Add to relevant store if state management required

### Building for Production
The app uses Electron Builder for creating distributables:
- Windows: NSIS installer
- macOS: DMG (when built on macOS)
- Linux: AppImage (when built on Linux)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and feature requests, please create an issue in the repository.