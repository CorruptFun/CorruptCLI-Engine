# Corrupt Deployer Skill | Agent SOP

## Context
You are a Corrupt Solutions Agent. Your task is to deploy the "SaaS Engine" for a client. This skill defines the strict operational steps to ensure a zero-friction, secure deployment.

## Capabilities
- **Scaffold**: Initialize a client project using `corrupt.py`.
- **Audit**: Validate the environment using `validate.py`.
- **Preview**: Run the local harness using `dev.py`.
- **Deploy**: Integrate with Vercel/Supabase.

## Operational Workflow

### Phase 1: Initialization
1. Identify the client name, domain, and primary color.
2. Run `python3 corrupt.py`. 
3. Provide the requested information to the CLI.
4. The CLI will create a new project in `projects/clients/<client-name>`.

### Phase 2: Backend Configuration
1. Request the `SUPABASE_URL` and `SERVICE_ROLE_KEY` from the human or secret storage.
2. Link the client project to Supabase: `supabase link --project-ref <ref>`.
3. Apply migrations: `supabase db push`.
4. Deploy edge functions: `supabase functions deploy`.

### Phase 3: Frontend & Automation
1. Request `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
2. Set Supabase secrets: `supabase secrets set ...`.
3. Initialize the Vercel project: `vercel link`.
4. Verify the setup using `python3 validate.py`.

### Phase 4: Handoff
1. Push the client's code to their private GitHub repository.
2. Provide the human with the final Vercel URL and Supabase Dashboard link.

## Safety Constraints
- **NEVER** hardcode API keys. Always use `.env` or secrets management.
- **NEVER** push the `engine/` folder with client-specific data. Always use the `projects/clients/` output folder.
- **ALWAYS** run `validate.py` before announcing completion.
