## AWSへのデプロイ計画 (Terraform)

この計画は、Dockerコンテナで構成されたシステムをAWS EC2にデプロイするためのTerraform構成と、GitHub Actionsを使ったCI/CDパイプラインの設定について記述します。デプロイ先リージョンは `ap-northeast-1` (東京) とし、Terraformの状態管理にはS3とDynamoDBを使用します。

### 1. VPCの構築

*   システムを配置するためのVPCを作成します。
*   パブリックサブネットとプライベートサブネットを作成します。
*   インターネットゲートウェイ、NATゲートウェイ、ルートテーブルを設定します。

### 2. EC2インスタンスの構築

*   各サービス (`frontend`, `backend`, `rtmp-server`) を実行するためのEC2インスタンスを作成します。インスタンスタイプは、システムの負荷に応じて選択します。
*   セキュリティグループを設定し、必要なポート (RTMP: 1935, HTTP: 8000, 8080, SSH: 22など) の通信を許可します。
*   各インスタンスにDockerをインストールし、コンテナを実行できるように設定します。

### 3. ECR (Elastic Container Registry) の設定

*   各サービス (`frontend`, `backend`, `rtmp-server`) のDockerイメージを保存するためのECRリポジトリを作成します。

### 4. S3バケットとDynamoDBテーブルの作成

*   Terraformのリモートステートを保存するためのS3バケットを作成します。
*   Terraformのロックを管理するためのDynamoDBテーブルを作成します。

### 5. IAMロールとポリシーの設定

*   EC2インスタンスがECRからDockerイメージを取得するためのIAMロールとポリシーを設定します。
*   GitHub ActionsがAWSリソースを操作するためのIAMユーザーまたはロールとポリシーを設定します。

### 6. Route 53 (オプション)

*   カスタムドメインを使用する場合、Route 53でDNSレコードを設定し、ALBまたはEC2インスタンスに関連付けます。

## CI/CDパイプライン計画 (GitHub Actions)

CI/CDパイプラインは、以下のステップで構成されます。

1.  **トリガー**:
    *   `main` ブランチへのプッシュやプルリクエストをトリガーとします。
2.  **ジョブ**:
    *   **Build and Push Docker Images**:
        *   コードをチェックアウトします。
        *   各サービスのDockerイメージをビルドします。
        *   ビルドしたDockerイメージをECRにプッシュします。
    *   **Deploy with Terraform**:
        *   コードをチェックアウトします。
        *   Terraformをセットアップします。
        *   S3とDynamoDBを使ったリモートステートを設定します。
        *   `terraform init` を実行します。
        *   `terraform plan` を実行し、デプロイ計画を確認します。
        *   `terraform apply` を実行し、AWSリソースをデプロイまたは更新します。

## 構成図 (Mermaid)

```mermaid
graph TD
    A[GitHub Repository] --> B{Push to main branch};
    B -- Trigger --> C[GitHub Actions Workflow];
    C --> D[Checkout Code];
    D --> E[Build Docker Images];
    E --> F[Push Docker Images to ECR];
    F --> G[Setup Terraform];
    G --> H[Configure S3 Backend];
    H --> I[Terraform Init];
    I --> J[Terraform Plan];
    J --> K[Terraform Apply];
    K --> L[AWS Cloud];
    L --> M[VPC];
    M --> N[Public Subnet];
    M --> O[Private Subnet];
    N --> P[Internet Gateway];
    O --> Q[NAT Gateway];
    N --> R[EC2 Instance - Frontend];
    N --> S[EC2 Instance - RTMP Server];
    O --> T[EC2 Instance - Backend];
    L --> U[ECR Repositories];
    L --> V[S3 Bucket for Terraform State];
    L --> W[DynamoDB Table for Terraform Lock];
    L --> X[IAM Roles and Policies];
    R --> U;
    S --> U;
    T --> U;
    C --> X;