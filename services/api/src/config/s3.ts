import { S3Client } from "@aws-sdk/client-s3";

export const s3 = new S3Client({
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
    },
    // LocalStack endpoint for local dev
    ...(process.env.S3_ENDPOINT
        ? {
            endpoint: process.env.S3_ENDPOINT,
            forcePathStyle: true,
        }
        : {}),
});

export const S3_BUCKET = process.env.S3_BUCKET ?? "tryiton-local";
