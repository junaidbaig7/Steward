import { Compass } from 'lucide-react'
import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import Button from './components/ui/Button'
import Spinner from './components/ui/Spinner'
import { EmptyState } from './components/ui/States'
import { AuthProvider } from './contexts/AuthContext'
import { CartProvider } from './contexts/CartContext'
import { ToastProvider } from './contexts/ToastContext'
import UserLayout from './layouts/UserLayout'
import RequireAuth from './components/auth/RequireAuth'
import Cart from './pages/user/Cart'
import Checkout from './pages/user/Checkout'
import OrderDetail from './pages/user/OrderDetail'
import Orders from './pages/user/Orders'
import Home from './pages/user/Home'
import Login from './pages/user/Login'
import RestaurantDetail from './pages/user/RestaurantDetail'
import Restaurants from './pages/user/Restaurants'
import Search from './pages/user/Search'

// Admin portal & dashboards are code-split: storefront visitors never download Recharts.
const AdminLayout = lazy(() => import('./layouts/AdminLayout'))
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminDishes = lazy(() => import('./pages/admin/AdminDishes'))
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'))
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'))
const AdminRestaurants = lazy(() => import('./pages/admin/AdminRestaurants'))
const AdminReviews = lazy(() => import('./pages/admin/AdminReviews'))
const Account = lazy(() => import('./pages/user/Account'))

function NotFound() {
  return (
    <div className="container-page pt-10">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
        action={<Button to="/">Back to home</Button>}
      />
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <CartProvider>
          <Suspense fallback={<div className="grid min-h-[60vh] place-items-center text-muted"><Spinner className="size-6" /></div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<RequireAuth role="ADMIN" />}>
              <Route element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="restaurants" element={<AdminRestaurants />} />
                <Route path="dishes" element={<AdminDishes />} />
                <Route path="analytics" element={<AdminAnalytics />} />
                <Route path="reviews" element={<AdminReviews />} />
              </Route>
            </Route>
            <Route element={<UserLayout />}>
              <Route index element={<Home />} />
              <Route path="restaurants" element={<Restaurants />} />
              <Route path="restaurants/:ref" element={<RestaurantDetail />} />
              <Route path="search" element={<Search />} />
              <Route path="cart" element={<Cart />} />
              <Route element={<RequireAuth role="USER" />}>
                <Route path="checkout" element={<Checkout />} />
                <Route path="orders" element={<Orders />} />
                <Route path="orders/:id" element={<OrderDetail />} />
                <Route path="account" element={<Account />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
          </Suspense>
        </CartProvider>
      </AuthProvider>
    </ToastProvider>
  )
}
