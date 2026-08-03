#!/bin/bash

echo "=========================================="
echo "🚀 Control de Cumplimiento de Despachos"
echo "=========================================="

# Verificar si Vite ya está ejecutándose
if lsof -i :5173 >/dev/null 2>&1; then
    echo "✅ El servidor ya está ejecutándose."
    echo "🌐 Abre la aplicación desde el puerto 5173."
    exit 0
fi

echo "🧹 Limpiando variables de entorno..."

unset VITE_SUPABASE_URL
unset VITE_SUPABASE_PUBLISHABLE_KEY

echo "📂 Ingresando a la aplicación..."

cd app || {
    echo "❌ No se encontró la carpeta app."
    exit 1
}

echo "🚀 Iniciando Vite..."
npm run dev