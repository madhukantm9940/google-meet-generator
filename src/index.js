const sdk = require('node-appwrite');
const { google } = require('googleapis');

/**
 * Appwrite Function: Google Meet Generator
 * Generates a real Google Meet link using the user's OAuth access token.
 */
module.exports = async function (context) {
    const client = new sdk.Client();
    
    // Initialize Appwrite Client
    client
        .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT)
        .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
        .setKey(process.env.APPWRITE_FUNCTION_API_KEY);

    const users = new sdk.Users(client);

    try {
        // Parse payload
        let payload = {};
        if (context.req.body) {
            try {
                payload = typeof context.req.body === 'string' ? JSON.parse(context.req.body) : context.req.body;
            } catch (e) {
                context.log('Error parsing body: ' + e.message);
            }
        }

        const userId = context.req.headers['x-appwrite-user-id'];
        if (!userId) {
            return context.res.json({ error: 'User not authenticated' }, 401);
        }

        context.log(`Generating Meet link for user: ${userId}`);

        // 1. Get the user's sessions to find the Google provider access token
        const sessions = await users.listSessions(userId);
        const googleSession = sessions.sessions.find(s => s.provider === 'google');

        if (!googleSession || !googleSession.providerAccessToken) {
            return context.res.json({ 
                error: 'No Google OAuth session found. Please ensure you are logged in with Google and have granted the Calendar scope.' 
            }, 400);
        }

        // 2. Initialize Google Auth with the user's token
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: googleSession.providerAccessToken });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        // 3. Create a Calendar Event with Conference Data
        const startTime = payload.dateTime ? new Date(payload.dateTime) : new Date();
        const endTime = new Date(startTime.getTime() + 3600000); // Default 1 hour duration

        const event = {
            summary: payload.title || 'Academic Sync - A100150 Hub',
            description: payload.purpose || 'Automatically scheduled via A100150 Student App.',
            start: { dateTime: startTime.toISOString() },
            end: { dateTime: endTime.toISOString() },
            conferenceData: {
                createRequest: {
                    requestId: `meet-${Date.now()}-${userId.substring(0, 5)}`,
                    conferenceSolutionKey: { type: 'hangoutsMeet' }
                }
            }
        };

        context.log('Inserting calendar event...');
        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            conferenceDataVersion: 1
        });

        const meetLink = response.data.hangoutLink;
        
        if (!meetLink) {
            throw new Error('Failed to generate Hangout link. Check if Google Calendar API is enabled and scopes are correct.');
        }

        context.log(`Successfully generated Meet link: ${meetLink}`);

        return context.res.json({
            success: true,
            meetLink: meetLink,
            eventId: response.data.id
        });

    } catch (err) {
        context.error('Function Error: ' + err.message);
        return context.res.json({ 
            success: false,
            error: err.message,
            details: 'Ensure Google Calendar API is enabled and "https://www.googleapis.com/auth/calendar.events" scope is added to Appwrite Google OAuth settings.'
        }, 500);
    }
};
