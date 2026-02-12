#!/bin/bash
echo "Installing dependencies..."
pip3 install -r requirements.txt

echo "Starting Email Search Worker..."
python3 worker.py
