# Deploying EvalMatchAI to Render

This document provides step-by-step instructions for deploying the EvalMatchAI application to Render.

## Prerequisites

1. A [Render](https://render.com) account
2. An [OpenAI API key](https://platform.openai.com/account/api-keys)
3. Your codebase in a Git repository (GitHub, GitLab, etc.)

## Step 1: Create a PostgreSQL Database

1. In the Render dashboard, click on "New" and select "PostgreSQL"
2. Fill in the following details:
   - Name: `evalmatch-db` (or your preferred name)
   - Database: `evalmatch`
   - User: Leave as auto-generated
   - Choose your region
   - Select a plan (Starter plan recommended for development)
3. Click "Create Database"
4. Once created, note the "Internal Database URL" - you'll need this for your web service

## Step 2: Create a Web Service

1. In the Render dashboard, click on "New" and select "Web Service"
2. Connect your GitHub/GitLab repository
3. Fill in the following details:
   - Name: `evalmatch-ai` (or your preferred name)
   - Environment: `Node`
   - Region: Choose the same region as your database
   - Branch: `main` (or your default branch)
   - Build Command: `npm install && npm run build`
   - Start Command: `node dist/index.js`
   - Plan: Choose appropriate plan (Starter is good for testing)

4. Add the following environment variables:
   - `NODE_ENV`: `production`
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `DATABASE_URL`: Copy the "Internal Database URL" from your PostgreSQL database

5. Click "Create Web Service"

## Step 3: Initial Database Migration

After your first deployment completes, you'll need to run the database migration to create the tables. 

1. In the Render dashboard, navigate to your web service
2. Go to the "Shell" tab
3. Run the command: `npm run db:push`

## Step 4: Verify Deployment

1. Once your service is deployed, click on the URL provided by Render to access your application
2. Test the application by:
   - Uploading a resume
   - Creating a job description
   - Running the analysis

## Troubleshooting

If you encounter any issues:

1. Check the logs in the Render dashboard
2. Verify your environment variables are set correctly
3. Make sure your OpenAI API key is valid and has sufficient quota

## Updating Your Application

When you push changes to your repository, Render will automatically redeploy your application.

## Additional Resources

- [Render Documentation](https://render.com/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)