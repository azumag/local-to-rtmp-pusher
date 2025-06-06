# StreamCaster Terraform Outputs

# === INSTANCE INFORMATION ===
output "instance_name" {
  description = "Name of the Lightsail instance"
  value       = aws_lightsail_instance.streamcaster.name
}

output "instance_id" {
  description = "ID of the Lightsail instance"
  value       = aws_lightsail_instance.streamcaster.id
}

output "availability_zone" {
  description = "Availability zone of the instance"
  value       = aws_lightsail_instance.streamcaster.availability_zone
}

output "bundle_id" {
  description = "Bundle ID (instance size) of the instance"
  value       = aws_lightsail_instance.streamcaster.bundle_id
}

output "blueprint_id" {
  description = "Blueprint ID (OS) of the instance"
  value       = aws_lightsail_instance.streamcaster.blueprint_id
}

# === NETWORK INFORMATION ===
output "public_ip_address" {
  description = "Public IP address of the instance"
  value       = aws_lightsail_instance.streamcaster.public_ip_address
}

output "private_ip_address" {
  description = "Private IP address of the instance"
  value       = aws_lightsail_instance.streamcaster.private_ip_address
}

output "static_ip_address" {
  description = "Static IP address (if enabled)"
  value       = var.enable_static_ip ? aws_lightsail_static_ip.streamcaster[0].ip_address : null
}

output "static_ip_name" {
  description = "Name of the static IP (if enabled)"
  value       = var.enable_static_ip ? aws_lightsail_static_ip.streamcaster[0].name : null
}

# === ACCESS URLS ===
output "web_ui_url" {
  description = "URL for the web control panel"
  value       = "http://${var.enable_static_ip ? aws_lightsail_static_ip.streamcaster[0].ip_address : aws_lightsail_instance.streamcaster.public_ip_address}:8080"
}

output "rtmp_pull_url" {
  description = "RTMP URL for pulling stream (e.g., for OBS)"
  value       = "rtmp://${var.enable_static_ip ? aws_lightsail_static_ip.streamcaster[0].ip_address : aws_lightsail_instance.streamcaster.public_ip_address}:1935/live/stream"
}

output "rtmp_stats_url" {
  description = "URL for RTMP server statistics"
  value       = "http://${var.enable_static_ip ? aws_lightsail_static_ip.streamcaster[0].ip_address : aws_lightsail_instance.streamcaster.public_ip_address}:8081/stat"
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh -i ~/.ssh/id_rsa ubuntu@${var.enable_static_ip ? aws_lightsail_static_ip.streamcaster[0].ip_address : aws_lightsail_instance.streamcaster.public_ip_address}"
}

# === SECURITY INFORMATION ===
output "key_pair_name" {
  description = "Name of the SSH key pair"
  value       = var.ssh_public_key_path != "" ? aws_lightsail_key_pair.streamcaster[0].name : null
}

output "firewall_rules" {
  description = "Configured firewall rules"
  value = [
    for rule in local.firewall_rules : {
      port     = rule.port
      protocol = rule.protocol
      cidrs    = rule.cidrs
    }
  ]
}

# === MONITORING INFORMATION ===
output "instance_bundle_id" {
  description = "Bundle ID of the instance"
  value       = aws_lightsail_instance.streamcaster.bundle_id
}

output "instance_tags" {
  description = "Tags applied to the instance"
  value       = aws_lightsail_instance.streamcaster.tags
}

# === BACKUP INFORMATION ===
output "backup_information" {
  description = "Information about backup strategy"
  value       = "Snapshots should be created manually or via CloudWatch scheduled tasks"
}

# === COST INFORMATION ===
output "estimated_monthly_cost" {
  description = "Estimated monthly cost based on bundle"
  value = {
    nano_2_0   = "$5 USD/month"
    micro_2_0  = "$10 USD/month"
    small_2_0  = "$20 USD/month"
    medium_2_0 = "$40 USD/month"
    large_2_0  = "$80 USD/month"
  }[var.instance_bundle_id]
}

# === DEPLOYMENT INFORMATION ===
output "deployment_info" {
  description = "Information about the deployed configuration"
  value = {
    environment       = var.environment
    project_name     = var.project_name
    repository_url   = var.repository_url
    deployment_branch = var.deployment_branch
    log_level        = var.log_level
  }
  sensitive = false
}

# === QUICK START GUIDE ===
output "quick_start_guide" {
  description = "Quick start commands after deployment"
  value = {
    connect_ssh    = "ssh -i ~/.ssh/id_rsa ubuntu@${var.enable_static_ip ? aws_lightsail_static_ip.streamcaster[0].ip_address : aws_lightsail_instance.streamcaster.public_ip_address}"
    web_ui        = "Open: http://${var.enable_static_ip ? aws_lightsail_static_ip.streamcaster[0].ip_address : aws_lightsail_instance.streamcaster.public_ip_address}:8080"
    check_status  = "curl http://${var.enable_static_ip ? aws_lightsail_static_ip.streamcaster[0].ip_address : aws_lightsail_instance.streamcaster.public_ip_address}:8080/api/health"
    view_logs     = "ssh -i ~/.ssh/id_rsa ubuntu@${var.enable_static_ip ? aws_lightsail_static_ip.streamcaster[0].ip_address : aws_lightsail_instance.streamcaster.public_ip_address} 'sudo docker-compose -f /home/ubuntu/streamcaster/docker-compose.yml logs -f'"
  }
}