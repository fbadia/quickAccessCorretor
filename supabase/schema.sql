-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create INSURERS Table
CREATE TABLE IF NOT EXISTS public.insurers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    assistance_phone TEXT,
    assistance_whatsapp TEXT,
    claims_phone TEXT,
    claims_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create CLIENTS Table
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    cpf_cnpj TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create POLICIES Table
CREATE TABLE IF NOT EXISTS public.policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    insurer_id UUID REFERENCES public.insurers(id) ON DELETE SET NULL,
    policy_number TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    storage_path TEXT UNIQUE,
    raw_extracted_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create VEHICLES Table
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID REFERENCES public.policies(id) ON DELETE CASCADE NOT NULL,
    plate TEXT NOT NULL,
    brand_model TEXT,
    year INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create PROFILES Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'broker')),
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON public.vehicles (UPPER(plate));
CREATE INDEX IF NOT EXISTS idx_clients_name ON public.clients USING gin (to_tsvector('portuguese', name));
CREATE INDEX IF NOT EXISTS idx_policies_client_id ON public.policies (client_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_policy_id ON public.vehicles (policy_id);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- Helper function to check if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Profiles policies
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Users can update their own profile name" ON public.profiles;
CREATE POLICY "Users can update their own profile name"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can do everything on profiles" ON public.profiles;
CREATE POLICY "Admins can do everything on profiles"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.is_admin());

-- Insurers policies
DROP POLICY IF EXISTS "Insurers are viewable by authenticated users" ON public.insurers;
CREATE POLICY "Insurers are viewable by authenticated users"
    ON public.insurers FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage insurers" ON public.insurers;
CREATE POLICY "Admins can manage insurers"
    ON public.insurers FOR ALL
    TO authenticated
    USING (public.is_admin());

-- Clients policies
DROP POLICY IF EXISTS "Clients are viewable by authenticated users" ON public.clients;
CREATE POLICY "Clients are viewable by authenticated users"
    ON public.clients FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage clients" ON public.clients;
CREATE POLICY "Admins can manage clients"
    ON public.clients FOR ALL
    TO authenticated
    USING (public.is_admin());

-- Policies policies
DROP POLICY IF EXISTS "Policies are viewable by authenticated users" ON public.policies;
CREATE POLICY "Policies are viewable by authenticated users"
    ON public.policies FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage policies" ON public.policies;
CREATE POLICY "Admins can manage policies"
    ON public.policies FOR ALL
    TO authenticated
    USING (public.is_admin());

-- Vehicles policies
DROP POLICY IF EXISTS "Vehicles are viewable by authenticated users" ON public.vehicles;
CREATE POLICY "Vehicles are viewable by authenticated users"
    ON public.vehicles FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage vehicles" ON public.vehicles;
CREATE POLICY "Admins can manage vehicles"
    ON public.vehicles FOR ALL
    TO authenticated
    USING (public.is_admin());

-- =====================================================
-- AUTH TRIGGERS
-- =====================================================

-- Automatically create a profile when a new user signs up / is invited
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role, email)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'broker'),
    new.email
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create default storage bucket for policies
INSERT INTO storage.buckets (id, name, public)
VALUES ('policies', 'policies', false)
ON CONFLICT (id) DO NOTHING;
