# StreamCaster Terraform Infrastructure

This directory contains Infrastructure as Code (IaC) definitions for deploying StreamCaster on AWS Lightsail using Terraform.

## 📋 Overview

- **Infrastructure**: AWS Lightsail instance with automatic application deployment
- **Automation**: Complete infrastructure provisioning and application setup
- **Multi-Environment**: Support for dev, staging, and production environments
- **Security**: Configurable firewall rules and SSH key management
- **Monitoring**: Optional CloudWatch integration and automatic snapshots

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│               Terraform                     │
├─────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────────┐ │
│ │ AWS Lightsail   │ │ Static IP          │ │
│ │ Instance        │ │ (Optional)         │ │
│ │ - Ubuntu 20.04  │ │                    │ │
│ │ - nano_2_0      │ │                    │ │
│ │ - $5/month      │ │                    │ │
│ └─────────────────┘ └─────────────────────┘ │
│ ┌─────────────────┐ ┌─────────────────────┐ │
│ │ Firewall Rules  │ │ SSH Key Pair       │ │
│ │ - SSH (22)      │ │ - Auto-generated   │ │
│ │ - Web UI (8080) │ │   or existing      │ │
│ │ - RTMP (1935)   │ │                    │ │
│ │ - Stats (8081)  │ │                    │ │
│ └─────────────────┘ └─────────────────────┘ │
│ ┌─────────────────┐ ┌─────────────────────┐ │
│ │ User Data       │ │ Snapshots          │ │
│ │ - Docker setup  │ │ - Automatic backup │ │
│ │ - App deploy    │ │ - Configurable     │ │
│ │ - Service start │ │   retention        │ │
│ └─────────────────┘ └─────────────────────┘ │
└─────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

1. **Terraform** (v1.5+)
   ```bash
   wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
   unzip terraform_1.6.0_linux_amd64.zip
   sudo mv terraform /usr/local/bin/
   ```

2. **AWS CLI** configured
   ```bash
   aws configure
   ```

3. **SSH Key Pair**
   ```bash
   ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa
   ```

4. **State Management Setup** (First time only)
   ```bash
   # See STATE-MANAGEMENT-SETUP.md for detailed instructions
   cd terraform/bootstrap
   terraform init
   terraform apply
   ```

### Basic Deployment

#### First Time Setup (State Management)
```bash
# 1. Setup state management (one-time)
cd terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars
# Edit bootstrap configuration
terraform init
terraform apply

# 2. Update main configuration with backend settings
# Copy the backend configuration from bootstrap output
cd ../
# Update terraform/main.tf with the backend configuration
```

#### Regular Deployment
1. **Clone and Navigate**
   ```bash
   git clone https://github.com/azumag/streamcaster.git
   cd streamcaster/terraform
   ```

2. **Configure Environment**
   ```bash
   # Copy example configuration
   cp terraform.tfvars.example terraform.tfvars
   
   # Edit configuration
   vim terraform.tfvars
   
   # Set sensitive variables
   export TF_VAR_stream_key="your_stream_key_here"
   export TF_VAR_rtmp_server="rtmp://live.twitch.tv/live"
   ```

3. **Deploy Infrastructure**
   ```bash
   # Initialize Terraform (with remote state)
   terraform init
   
   # Preview changes
   terraform plan
   
   # Apply changes
   terraform apply
   
   # Get access information
   terraform output
   ```

4. **Access Your Deployment**
   ```bash
   # Web UI URL
   echo "Web UI: $(terraform output -raw web_ui_url)"
   
   # SSH connection
   terraform output -raw ssh_command
   
   # RTMP pull URL for OBS
   echo "RTMP: $(terraform output -raw rtmp_pull_url)"
   ```

## 📁 File Structure

```
terraform/
├── main.tf                    # Main Terraform configuration
├── variables.tf               # Variable definitions
├── outputs.tf                 # Output definitions
├── lightsail.tf              # Lightsail resources
├── backend.tf                # State management reference
├── terraform.tfvars.example  # Example configuration
├── README.md                 # This file
├── STATE-MANAGEMENT-SETUP.md # State setup guide
├── bootstrap/                # State management setup
│   ├── main.tf               # Bootstrap resources (S3, DynamoDB)
│   ├── variables.tf          # Bootstrap variables
│   ├── outputs.tf            # Bootstrap outputs
│   └── terraform.tfvars.example # Bootstrap config example
├── environments/             # Environment-specific configs
│   ├── dev/
│   │   └── terraform.tfvars  # Development settings
│   ├── staging/
│   │   └── terraform.tfvars  # Staging settings (optional)
│   └── prod/
│       └── terraform.tfvars  # Production settings
└── templates/
    └── user-data.sh          # Instance initialization script
```

## ⚙️ Configuration

### Core Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `project_name` | Project name for resources | `streamcaster` | No |
| `environment` | Environment (dev/staging/prod) | - | Yes |
| `aws_region` | AWS region | `ap-northeast-1` | No |
| `instance_bundle_id` | Instance size | `nano_2_0` ($5/month) | No |

### Security Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `admin_ip_ranges` | CIDR blocks for SSH access | `["203.0.113.1/32"]` |
| `web_access_cidrs` | CIDR blocks for Web UI | `["0.0.0.0/0"]` |
| `stream_key` | RTMP stream key | Set via `TF_VAR_stream_key` |

### Application Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `repository_url` | Git repository URL | `https://github.com/azumag/streamcaster.git` |
| `deployment_branch` | Git branch to deploy | `main` |
| `rtmp_server` | RTMP server URL | `rtmp://live.twitch.tv/live` |

### Feature Flags

| Variable | Description | Default |
|----------|-------------|---------|
| `enable_static_ip` | Allocate static IP | `true` |
| `enable_automatic_snapshots` | Create snapshots | `true` |
| `enable_monitoring` | Enable CloudWatch | `true` |

## 🌍 Multi-Environment Management

### Development Environment
```bash
terraform apply -var-file="environments/dev/terraform.tfvars"
```

### Production Environment
```bash
terraform apply -var-file="environments/prod/terraform.tfvars"
```

### Environment Differences

| Feature | Development | Production |
|---------|-------------|------------|
| Static IP | Disabled (cost saving) | Enabled |
| Snapshots | 3-day retention | 7-day retention |
| Monitoring | Disabled | Enabled |
| Branch | `development` | `main` |
| Log Level | `debug` | `info` |

## 🔒 Security Best Practices

### 1. Restrict Access
```hcl
# terraform.tfvars
admin_ip_ranges = [
  "203.0.113.1/32",      # Your IP
  "203.0.113.0/24"       # Your office network
]
```

### 2. Use Environment Variables
```bash
export TF_VAR_stream_key="your_secret_stream_key"
export TF_VAR_google_drive_api_key="your_api_key"
```

### 3. Enable State Encryption
```hcl
# Uncomment in main.tf
backend "s3" {
  bucket  = "streamcaster-terraform-state"
  key     = "lightsail/terraform.tfstate"
  encrypt = true
}
```

## 📊 Monitoring & Maintenance

### Check Instance Status
```bash
# View all outputs
terraform output

# Check specific status
terraform refresh
terraform show
```

### Update Application
```bash
# SSH to instance
$(terraform output -raw ssh_command)

# Update application
cd /home/ubuntu/streamcaster
git pull origin main
docker-compose --env-file .env.production down
docker-compose --env-file .env.production up -d --build
```

### Create Manual Snapshot
```bash
aws lightsail create-instance-snapshot \
  --instance-name $(terraform output -raw instance_name) \
  --instance-snapshot-name "manual-$(date +%Y%m%d)"
```

## 💰 Cost Management

### Instance Costs

| Bundle | CPU | RAM | Storage | Monthly Cost |
|--------|-----|-----|---------|-------------|
| `nano_2_0` | 1 vCPU | 1 GB | 40 GB | $5 |
| `micro_2_0` | 1 vCPU | 2 GB | 60 GB | $10 |
| `small_2_0` | 2 vCPU | 4 GB | 80 GB | $20 |
| `medium_2_0` | 2 vCPU | 8 GB | 160 GB | $40 |

### Additional Costs
- **Static IP**: Free when attached to instance
- **Snapshots**: $0.05/GB/month
- **Data Transfer**: 2TB included, $0.09/GB overage

### Cost Optimization
```hcl
# Cost-optimized development
instance_bundle_id = "nano_2_0"
enable_static_ip = false
enable_automatic_snapshots = false
backup_retention_days = 1
```

## 🔄 CI/CD Integration

### GitHub Actions Workflow

The included `.github/workflows/terraform.yml` provides:

- **Validation**: Format checking and validation
- **Security Scanning**: Checkov security analysis
- **Environment Deployment**: Automatic dev/prod deployment
- **Plan Artifacts**: Stored plans for review
- **Manual Triggers**: Workflow dispatch for manual operations

### Triggering Deployment

1. **Automatic**: Push to `main` (prod) or `development` (dev)
2. **Manual**: GitHub Actions → "Terraform Infrastructure" → "Run workflow"

### Required Secrets

Set these in GitHub repository settings:

| Secret | Description |
|--------|-------------|
| `AWS_ROLE_ARN` | AWS IAM Role ARN for OIDC authentication |
| `TF_STATE_BUCKET` | Terraform state S3 bucket |
| `TF_STATE_DYNAMODB_TABLE` | Terraform state DynamoDB table |
| `PROD_STREAM_KEY` | Production stream key |
| `DEV_STREAM_KEY` | Development stream key |
| `PROD_RTMP_SERVER` | Production RTMP server |
| `DEV_RTMP_SERVER` | Development RTMP server |

## 🐛 Troubleshooting

### Common Issues

#### 1. SSH Connection Failed
```bash
# Check key pair exists
ls -la ~/.ssh/id_rsa*

# Regenerate if needed
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa

# Re-apply Terraform
terraform apply
```

#### 2. Application Not Starting
```bash
# SSH to instance
$(terraform output -raw ssh_command)

# Check user data script logs
sudo tail -f /var/log/streamcaster-init.log

# Check Docker containers
docker-compose -f /home/ubuntu/streamcaster/docker-compose.yml --env-file /home/ubuntu/streamcaster/.env.production ps
```

#### 3. Terraform State Issues
```bash
# Refresh state
terraform refresh

# Import existing resources if needed
terraform import aws_lightsail_instance.streamcaster streamcaster-prod

# Force unlock if locked
terraform force-unlock LOCK_ID
```

#### 4. Access Denied Errors
```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify IAM permissions
aws lightsail get-instances
```

### Log Locations

| Component | Log Location |
|-----------|-------------|
| Terraform | Local `terraform.log` |
| User Data | `/var/log/streamcaster-init.log` |
| Application | `/home/ubuntu/streamcaster/logs/` |
| Docker | `docker-compose logs` |

## 🔧 Advanced Configuration

### Custom Domain Setup
```hcl
# Uncomment in lightsail.tf
resource "aws_lightsail_domain" "streamcaster" {
  domain_name = "stream.yourdomain.com"
}
```

### Remote State Management
```hcl
# Configure in main.tf
backend "s3" {
  bucket         = "your-terraform-state-bucket"
  key            = "streamcaster/terraform.tfstate"
  region         = "ap-northeast-1"
  encrypt        = true
  dynamodb_table = "terraform-locks"
}
```

### Custom User Data
```bash
# Edit templates/user-data.sh
# Add custom installation steps
# Restart deployment: terraform apply
```

## 📞 Support

### Getting Help

1. **Documentation**: Check README files and comments
2. **Terraform Docs**: [terraform.io](https://terraform.io/docs)
3. **AWS Lightsail Docs**: [AWS Documentation](https://docs.aws.amazon.com/lightsail/)
4. **Issues**: GitHub Issues for bug reports

### Useful Commands

```bash
# Get help
terraform --help
terraform plan --help

# Debug mode
export TF_LOG=DEBUG
terraform apply

# State operations
terraform state list
terraform state show aws_lightsail_instance.streamcaster

# Import existing resources
terraform import aws_lightsail_instance.streamcaster instance-name
```

---

**Terraform Version**: 1.6.0+  
**AWS Provider**: ~> 5.0  
**Tested Regions**: ap-northeast-1 (Tokyo)  
**Last Updated**: 2025-06-06