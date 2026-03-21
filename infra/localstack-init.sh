#!/bin/bash
# LocalStack init: create S3 bucket on startup
awslocal s3 mb s3://tryiton-local --region us-east-1
awslocal s3api put-bucket-cors --bucket tryiton-local --cors-configuration '{
  "CORSRules": [{
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET","PUT","POST","DELETE","HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }]
}'
echo "LocalStack S3 bucket created"
