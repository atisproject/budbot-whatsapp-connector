"""
BudBot Backend Integration Guide for WhatsApp Connector v5.0
This file shows how to integrate the WhatsApp Connector route into your Flask app
"""

# Add this to your main app.py file in the register_blueprints function:

def register_blueprints(app):
    """Register all blueprints da aplicação"""
    
    # ... your existing blueprints ...
    
    # Blueprint do WhatsApp Connector v5.0
    from backend.whatsapp_connector import whatsapp_connector_bp
    app.register_blueprint(whatsapp_connector_bp, url_prefix='/api/whatsapp')
    
    # ... rest of your blueprints ...

# Required model updates for backend/models.py:

"""
Update your Message model to remove the 'timestamp' field if it exists,
since it conflicts with the PostgreSQL schema:

class Message(db.Model):
    __tablename__ = 'messages'
    
    id = Column(Integer, primary_key=True)
    lead_id = Column(Integer, ForeignKey('leads.id'), nullable=False)
    sender = Column(String(255), nullable=True)
    content = Column(Text, nullable=False)
    message_type = Column(String(50), nullable=True)
    is_read = Column(Boolean, default=False, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(BRAZIL_TZ))
    
    # NOTE: Remove 'timestamp' field - it doesn't exist in the database
"""

# Environment variables needed in your backend:

"""
Add these to your backend environment variables:

# WhatsApp Connector Integration
WEBHOOK_TOKEN=budbot_webhook_secret_2025

The connector will call: POST /api/whatsapp/connector
With Authorization: Bearer budbot_webhook_secret_2025
"""

# Test the integration:

"""
After deploying, test with:

curl -X POST https://your-backend.onrender.com/api/whatsapp/connector \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer budbot_webhook_secret_2025" \
  -d '{
    "event": "qr_generated",
    "data": {"qr_code": "test"},
    "timestamp": "2025-08-07T14:00:00.000Z",
    "session_id": "main",
    "token": "budbot_webhook_secret_2025"
  }'

Expected response:
{"status": "ok", "message": "QR code received"}
"""