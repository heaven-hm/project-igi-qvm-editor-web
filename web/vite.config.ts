import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>({base:loadEnv(mode,'.','QVM_').QVM_BASE || '/',plugins:[react()],build:{target:'es2022'}}));
