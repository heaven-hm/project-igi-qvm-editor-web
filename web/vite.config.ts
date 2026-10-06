import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:process.env.QVM_BASE || '/',plugins:[react()],build:{target:'es2022'}});
