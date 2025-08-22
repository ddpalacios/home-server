typedef struct Invitation {
	char* Id;
	char* sessionid;
	char* expiration_date;
	int exists;
}invitations;
struct Invitation create_invitation(char* sessionid);
struct Invitation get_invitation(char* invitationid);
void insert_invitation(struct Invitation invitation);
void delete_invitation(struct Invitation invitation);
int invitation_exists(char* invitationid);
