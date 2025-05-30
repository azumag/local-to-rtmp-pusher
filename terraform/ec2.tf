resource "aws_security_group" "frontend_sg" {
  name_prefix = "frontend-sg-"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Allow HTTP from internet"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Allow SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # 必要に応じて制限してください
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "local-to-rtmp-pusher-frontend-sg"
  }
}

resource "aws_security_group" "backend_sg" {
  name_prefix = "backend-sg-"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Allow HTTP from frontend"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    security_groups = [aws_security_group.frontend_sg.id]
  }

  ingress {
    description = "Allow SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # 必要に応じて制限してください
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "local-to-rtmp-pusher-backend-sg"
  }
}

resource "aws_security_group" "rtmp_server_sg" {
  name_prefix = "rtmp-server-sg-"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Allow RTMP from internet"
    from_port   = 1935
    to_port     = 1935
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Allow HTTP from internet (for HLS/DASH)"
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Allow SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # 必要に応じて制限してください
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "local-to-rtmp-pusher-rtmp-server-sg"
  }
}

resource "aws_instance" "frontend" {
  ami           = "ami-0abcdef1234567890" # 環境に合わせて変更してください
  instance_type = "t3.micro" # 環境に合わせて変更してください
  subnet_id     = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.frontend_sg.id]
  associate_public_ip_address = true

  user_data = <<-EOF
              #!/bin/bash
              sudo yum update -y
              sudo yum install -y docker
              sudo systemctl start docker
              sudo systemctl enable docker
              sudo usermod -a -G docker ec2-user
              sudo docker login -u AWS -p $(aws ecr get-login-password --region ap-northeast-1) <your-aws-account-id>.dkr.ecr.ap-northeast-1.amazonaws.com # <your-aws-account-id> を変更してください
              sudo docker run -d -p 8080:80 <your-aws-account-id>.dkr.ecr.ap-northeast-1.amazonaws.com/local-to-rtmp-pusher-frontend:latest # <your-aws-account-id> を変更してください
              EOF

  tags = {
    Name = "local-to-rtmp-pusher-frontend"
  }
}

resource "aws_instance" "backend" {
  ami           = "ami-0abcdef1234567890" # 環境に合わせて変更してください
  instance_type = "t3.micro" # 環境に合わせて変更してください
  subnet_id     = aws_subnet.private[0].id
  vpc_security_group_ids = [aws_security_group.backend_sg.id]
  associate_public_ip_address = false # プライベートサブネットなのでfalse

  user_data = <<-EOF
              #!/bin/bash
              sudo yum update -y
              sudo yum install -y docker
              sudo systemctl start docker
              sudo systemctl enable docker
              sudo usermod -a -G docker ec2-user
              sudo docker login -u AWS -p $(aws ecr get-login-password --region ap-northeast-1) <your-aws-account-id>.dkr.ecr.ap-northeast-1.amazonaws.com # <your-aws-account-id> を変更してください
              sudo docker run -d -p 3000:3000 -e RTMP_SERVER=rtmp://<rtmp-server-private-ip>:1935/live <your-aws-account-id>.dkr.ecr.ap-northeast-1.amazonaws.com/local-to-rtmp-pusher-backend:latest # <rtmp-server-private-ip> と <your-aws-account-id> を変更してください
              EOF

  tags = {
    Name = "local-to-rtmp-pusher-backend"
  }
}

resource "aws_instance" "rtmp_server" {
  ami           = "ami-0abcdef1234567890" # 環境に合わせて変更してください
  instance_type = "t3.medium" # RTMP処理のため少し大きめ # 環境に合わせて変更してください
  subnet_id     = aws_subnet.public[1].id
  vpc_security_group_ids = [aws_security_group.rtmp_server_sg.id]
  associate_public_ip_address = true

  user_data = <<-EOF
              #!/bin/bash
              sudo yum update -y
              sudo yum install -y docker
              sudo systemctl start docker
              sudo systemctl enable docker
              sudo usermod -a -G docker ec2-user
              sudo docker login -u AWS -p $(aws ecr get-login-password --region ap-northeast-1) <your-aws-account-id>.dkr.ecr.ap-northeast-1.amazonaws.com # <your-aws-account-id> を変更してください
              sudo docker run -d -p 1935:1935 -p 8000:8000 <your-aws-account-id>.dkr.ecr.ap-northeast-1.amazonaws.com/local-to-rtmp-pusher-rtmp-server:latest # <your-aws-account-id> を変更してください
              EOF

  tags = {
    Name = "local-to-rtmp-pusher-rtmp-server"
  }
}