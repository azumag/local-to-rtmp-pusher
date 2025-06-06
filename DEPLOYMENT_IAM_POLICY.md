# GitHub Actions用IAM権限設定

現在のデプロイメントエラーを解決するため、以下のIAM権限をGitHub Actions用ユーザーに追加してください。

## 必要な追加権限

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ec2:DescribeAvailabilityZones",
                "ec2:DescribeRegions"
            ],
            "Resource": "*"
        }
    ]
}
```

## 手動設定手順

1. AWS Console → IAM → Users → github-action ユーザーを選択
2. "Add permissions" → "Attach policies directly"
3. "Create policy" で新しいポリシーを作成
4. 上記のJSONを貼り付け
5. ポリシー名: `StreamcasterEC2ReadOnlyAccess`
6. ユーザーにアタッチ

## 現在のエラー

```
Error: fetching Availability Zones: operation error EC2: DescribeAvailabilityZones, 
https response error StatusCode: 403, RequestID: ee914917-0bdb-4f91-abff-9bb69cfd0093, 
api error UnauthorizedOperation: You are not authorized to perform this operation. 
User: arn:aws:iam::982035845958:user/github-action is not authorized to perform: 
ec2:DescribeAvailabilityZones because no identity-based policy allows the 
ec2:DescribeAvailabilityZones action
```

この権限が追加されると、Terraformのデプロイが正常に進行するはずです。